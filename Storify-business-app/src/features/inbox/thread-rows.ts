import { isApiError, isRetryable } from '@/api/errors';
import type { ConversationMessage, ImageSet } from '@/contracts/mobile/biz/v1';
import type { SelectedUploadFile } from '@/features/uploads/selected-file';

/** A product shared in a reply, as the operator picked it: its price in the store's words. */
export type ReplyProduct = { id: string; name: string; image?: ImageSet; price?: string };

/** A reply the operator sent, shown at once until the store's answer (or its thread) settles it. */
export type PendingReply = {
  /** The app's own id for it: its `Idempotency-Key` is kept by it. */
  localId: string;
  body: string;
  /** The product it shares. */
  product?: ReplyProduct;
  /** The file it carries, with `body` as its caption. */
  file?: SelectedUploadFile;
  /** An internal note for the team (POST …/notes), never sent to the customer. */
  note?: true;
  /**
   * The text of a file's message on a channel that takes no caption: sent on
   * its own once that file (this `localId`) is stored, never before, and not
   * if the store refuses the file.
   */
  waitsFor?: string;
  /** When it was sent, by the phone's clock: its place in the thread. */
  createdAt: string;
  /**
   * The store's time of the thread's newest message when it was sent, if any:
   * a team message with the same text stored after it may be this reply, and
   * a message from the customer after it is news since.
   */
  after?: string;
  /** When the channel's reply window ended, by the store's word when it was sent, if it has one. */
  windowEndsAt?: string;
  /** No answer, or a refusal: why is in `error`. */
  failed: boolean;
  error?: unknown;
};

export type ThreadRow =
  | {
      kind: 'message';
      key: string;
      message: ConversationMessage;
      /** The oldest of a run of one sender's messages, a few minutes apart at most: it gets the picture and the name. */
      firstOfRun: boolean;
      /** The newest of its run: it gets the time. */
      lastOfRun: boolean;
    }
  | { kind: 'pending'; key: string; reply: PendingReply }
  | { kind: 'day'; key: string; at: string };

/**
 * Messages further apart than this start a run of their own, with the
 * sender's picture and their own time: a reply an hour later is not read as
 * part of what came before.
 */
export const RUN_GAP_MS = 5 * 60 * 1000;

/** The local calendar day a moment falls on. */
function dayOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Who wrote a message, for runs: the team's messages say their sender's name
 * once per run, as several people answer for one store. The customer's and
 * the store's own lines need no name.
 */
function authorOf(message: ConversationMessage): string | null {
  if (message.senderType === 'system') return null;
  return message.direction === 'inbound' ? 'inbound' : `${message.direction}:${message.senderName}`;
}

/** The operator, as GET /me names them: their own messages are told from a colleague's by it. */
export type Operator = { id?: string; name?: string };

/**
 * Whether the operator wrote a message: by the writer's account where the
 * store names it, else by name. A colleague's message with the same words
 * never stands for the operator's reply that did not arrive.
 */
function writtenBy(message: ConversationMessage, me: Operator | undefined): boolean {
  if (message.senderId && me?.id) return message.senderId === me.id;
  if (me?.name) return message.senderName === me.name;
  return true;
}

/**
 * Whether the store may hold a reply that failed: no answer came, the store
 * faulted, or it was still at an earlier try of the same key. A refusal (4xx)
 * is the store's answer about this reply, and stays with its reason.
 */
function mayBeStored(reply: PendingReply): boolean {
  const { error } = reply;
  return (
    reply.failed &&
    (isRetryable(error) || (isApiError(error) && error.code === 'REQUEST_IN_PROGRESS'))
  );
}

/**
 * Whether a team message may be this reply: the same text, the same product
 * (whose message may carry the product's name and link for text), the same file.
 */
function sameReply(message: ConversationMessage, reply: PendingReply): boolean {
  // A note is only ever a note, a reply only ever the team's reply.
  if (message.direction !== (reply.note ? 'internal' : 'outbound')) return false;
  if (reply.product) {
    return (
      message.product?.id === reply.product.id &&
      (reply.body ? message.body === reply.body : message.bodyIsFallback === true)
    );
  }
  if (reply.file) {
    const { filename } = reply.file;
    return (
      message.body === reply.body &&
      message.attachments.some((attachment) => attachment.name === filename)
    );
  }
  return message.body === reply.body && !message.product;
}

/**
 * The replies still to show. A failed reply the store may hold anyway is
 * settled by the operator's own message (`me`) with the same text stored after it was sent: its
 * answer was lost, not the reply, and it is not shown twice. A reply still on
 * its way waits for its own answer. Each stored message settles one reply,
 * and none settles a reply when it is already another's copy (`storedIds`,
 * named by that reply's answer): the same words sent twice stay two.
 */
export function unsettledReplies(
  messages: readonly ConversationMessage[],
  pending: readonly PendingReply[],
  storedIds: readonly string[],
  me?: Operator
): PendingReply[] {
  const settled = new Set<string>(storedIds);
  return pending.filter((reply) => {
    if (!mayBeStored(reply)) return true;
    // Compared as times: the same moment can be written with or without its milliseconds.
    const after = reply.after === undefined ? Number.NaN : Date.parse(reply.after);
    const stored = messages.find(
      (message) =>
        !settled.has(message.id) &&
        writtenBy(message, me) &&
        sameReply(message, reply) &&
        (Number.isNaN(after) || Date.parse(message.createdAt) > after)
    );
    if (!stored) return true;
    settled.add(stored.id);
    return false;
  });
}

/** A message that is only a shared product: no text of its own (or only the product's link), no files. */
function onlyProduct(message: ConversationMessage): boolean {
  return (
    message.product !== undefined &&
    (!message.body || message.bodyIsFallback === true) &&
    message.attachments.length === 0 &&
    !message.webOnlyAttachments
  );
}

/**
 * The thread's rows, newest first: the list is drawn upside down, so the
 * first row sits at the bottom, next to the composer. The replies on their
 * way come under the newest message; each day's separator sits above its
 * first message; a message says whether it starts its sender's run and
 * whether it ends it.
 */
export function threadRows(
  messages: readonly ConversationMessage[],
  pending: readonly PendingReply[]
): ThreadRow[] {
  // `apart`: a product shared on its own, drawn as a card across the thread with no picture
  // beside it. It ends its run, and what follows starts one with the picture again.
  type Entry = { at: string; author: string | null; apart: boolean; row: ThreadRow };
  const entries: Entry[] = [
    ...[...pending].reverse().map((reply): Entry => ({
      at: reply.createdAt,
      author: reply.note ? 'pending-note' : 'pending',
      apart: false,
      row: { kind: 'pending', key: `pending-${reply.localId}`, reply },
    })),
    ...messages.map((message): Entry => ({
      at: message.createdAt,
      author: authorOf(message),
      apart: onlyProduct(message),
      row: { kind: 'message', key: message.id, message, firstOfRun: true, lastOfRun: true },
    })),
  ];

  const rows: ThreadRow[] = [];
  entries.forEach((entry, index) => {
    const older = entries[index + 1];
    const newer = entries[index - 1];
    const sameDay = older !== undefined && dayOf(older.at) === dayOf(entry.at);
    const close = (a: Entry, b: Entry) =>
      Math.abs(Date.parse(a.at) - Date.parse(b.at)) <= RUN_GAP_MS;
    const follows = sameDay && !older.apart && older.author === entry.author && close(older, entry);
    const continued =
      !entry.apart &&
      newer !== undefined &&
      dayOf(newer.at) === dayOf(entry.at) &&
      newer.author === entry.author &&
      close(newer, entry);
    rows.push(
      entry.row.kind === 'message'
        ? {
            ...entry.row,
            firstOfRun: !follows,
            lastOfRun: !continued,
          }
        : entry.row
    );
    if (!sameDay) rows.push({ kind: 'day', key: `day-${index}-${dayOf(entry.at)}`, at: entry.at });
  });
  return rows;
}
