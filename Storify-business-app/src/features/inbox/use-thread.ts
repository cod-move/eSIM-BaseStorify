import { onlineManager, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';

import { isApiError, isNetworkError, isRetryable } from '@/api/errors';
import { AlreadySending, AttemptAbandoned } from '@/api/keyed-mutation';
import { useToast } from '@/components/ui/toast';
import type { Conversation, ConversationMessage } from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { currentWorkspace, useWorkspaceScope } from '@/features/workspace/use-workspace';

import { conversationOnScreen } from './conversation-on-screen';
import {
  pendingRepliesOf,
  replyStored,
  sentByThisPerson,
  threadKey,
  updatePendingReplies,
  usePendingReplies,
  useStoredReplyIds,
} from './pending-replies';
import { replyDraftKey, restoreReplyDraft, setNoteMode } from './reply-drafts';
import type { PendingReply } from './thread-rows';
import { useAddNote, useMarkConversationRead, useSendMessage } from './use-inbox';

/**
 * What the operator sends: text, and a product or a file with it; or a note
 * for the team. `textApart`: the channel takes no caption, so the text goes
 * as a message of its own after the file.
 */
export type ReplyDraft = Pick<PendingReply, 'body' | 'product' | 'file' | 'note'> & {
  textApart?: boolean;
};

/** How often an open thread is read again (3 to 5 seconds, the API's advice; a 304 when nothing moved). */
export const THREAD_POLL_MS = 4_000;
/**
 * Read further back than this many pages, the thread is read again less
 * often: every read asks for every page the operator has loaded.
 */
export const THREAD_POLL_PAGES = 2;
export const THREAD_POLL_FAR_MS = 20_000;

/**
 * Marks the conversation read while it is in front (`active`): when it opens,
 * and again when a new message from the customer shows. Once per count of
 * unread messages, so a read whose answer is slow is not sent twice; one that
 * got no answer (or met the store's fault) is tried again at the thread's next
 * read (`readAt`). A refusal stands: asking again would be refused again.
 */
export function useMarkThreadRead(
  id: string,
  unreadCount: number | undefined,
  active: boolean,
  readAt: number
) {
  const { mutate } = useMarkConversationRead(id);
  const markedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!unreadCount) {
      markedFor.current = null;
      return;
    }
    if (!active || markedFor.current === unreadCount) return;
    markedFor.current = unreadCount;
    mutate(undefined, {
      onError: (error) => {
        if (isRetryable(error)) markedFor.current = null;
      },
    });
  }, [active, unreadCount, readAt, mutate]);
}

/**
 * Whether sending the same reply again may still work: no answer came (the
 * store may have it; the same key finds it), the store was busy, or asked to
 * wait. A refusal for a reason (closed, the window, a permission) stays one.
 */
export function canRetryReply(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (!isApiError(error)) return false;
  return error.status >= 500 || error.status === 429 || error.code === 'REQUEST_IN_PROGRESS';
}

/** Whether the store's time `time` comes after `than`; any time comes after none. */
function later(time: string | undefined, than: string | undefined): boolean {
  if (time === undefined) return false;
  return than === undefined || Date.parse(time) > Date.parse(than);
}

/**
 * Whether the store refused a reply because the channel's reply window has
 * closed (B5), and its word still stands: until the conversation says the
 * window ends later than it did when the reply was sent, or the customer has
 * written since (which opens it again).
 */
export function refusedForWindow(
  pending: readonly PendingReply[],
  conversation: Conversation,
  messages: readonly ConversationMessage[]
): boolean {
  const lastFromCustomer = messages.find((message) => message.direction === 'inbound');
  return pending.some(
    (reply) =>
      !reply.note &&
      reply.failed &&
      isApiError(reply.error) &&
      reply.error.reason === 'REPLY_WINDOW_CLOSED' &&
      !later(conversation.replyWindowEndsAt, reply.windowEndsAt) &&
      !later(lastFromCustomer?.createdAt, reply.after)
  );
}

/**
 * The operator's replies to a conversation, and the notes they write in it
 * for the team: a note goes to POST …/notes, never to
 * the customer, and is drawn as a note from the moment it is sent. Each shows
 * at once as "sending"; the store's answer replaces it with the message as
 * stored (`useSendMessage` puts it into the thread). With no answer, the reply
 * stays as "not sent" and `retry` sends it again with the same key, so the
 * customer never gets it twice. Offline, nothing is sent and `reply` says no:
 * the text stays in the field.
 *
 * The replies are kept outside the screen (`pending-replies`): one sent just
 * before the operator went back is still there when they return, and one
 * that fails while they are elsewhere is said in a toast, with the way back
 * while the operator still works where the conversation is. Whatever ends
 * after the person who sent it signed out is theirs, and nothing is said.
 * One the store refused (a product it will not share, a file the channel
 * does not take, a closed conversation) can be taken back to the draft
 * (`edit`) or let go (`discard`).
 */
export function useReplies(id: string, name: string) {
  const t = useTranslations('common');
  const inbox = useTranslations('inbox.thread');
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const workspace = scope?.workspace;
  const thread = threadKey(workspace, id);
  const pending = usePendingReplies(thread);
  const storedIds = useStoredReplyIds(thread);
  const { submit } = useSendMessage(id);
  const { submit: submitNote } = useAddNote(id);

  const deliverRef = useRef<(reply: PendingReply) => Promise<void>>(async () => undefined);

  const deliver = useCallback(
    async (reply: PendingReply) => {
      const samePerson = sentByThisPerson();
      const mark = (localIds: string[], change: Partial<PendingReply>) =>
        updatePendingReplies(thread, (list) =>
          list.map((entry) => (localIds.includes(entry.localId) ? { ...entry, ...change } : entry))
        );
      mark([reply.localId], { failed: false, error: undefined });
      // The text of a file on a channel without captions goes once its file is
      // stored: while the file is still to go, sending it again is the file's.
      if (reply.waitsFor) {
        const file = pendingRepliesOf(thread).find((entry) => entry.localId === reply.waitsFor);
        if (file) {
          void deliverRef.current(file);
          return;
        }
        // Its file is stored, or was taken back: the text goes on its own.
        mark([reply.localId], { waitsFor: undefined });
      }
      const followers = () =>
        pendingRepliesOf(thread).filter((entry) => entry.waitsFor === reply.localId);
      try {
        const sent = reply.note
          ? await submitNote({ body: reply.body, localId: reply.localId })
          : await submit({
              body: reply.body,
              localId: reply.localId,
              ...(reply.product ? { productId: reply.product.id } : {}),
              ...(reply.file ? { file: reply.file } : {}),
            });
        // Answered after the person who sent it signed out: forgotten with them.
        if (!samePerson()) return;
        replyStored(thread, reply.localId, sent.message.id);
        for (const follower of followers()) {
          const next = { ...follower, waitsFor: undefined };
          mark([follower.localId], { waitsFor: undefined });
          void deliverRef.current(next);
        }
      } catch (error) {
        // A second tap of "Try again" while the first is on its way: the first decides.
        if (error instanceof AlreadySending) return;
        // The person who sent it signed out meanwhile: it was theirs, and the next
        // person is told nothing of it (it names the customer).
        if (error instanceof AttemptAbandoned || !samePerson()) return;
        // What waits for it is not sent either, and says why.
        mark([reply.localId, ...followers().map((entry) => entry.localId)], {
          failed: true,
          error,
        });
        if (conversationOnScreen() === id) return;
        // After a switch the conversation is the other workspace's: it would open
        // as "not found" here. The reply waits there, "not sent", for the way back.
        const reachable = currentWorkspace(queryClient) === workspace;
        toast.show({
          message: inbox(reply.note ? 'noteNotSavedAway' : 'notSentAway', { name }),
          tone: 'danger',
          ...(reachable
            ? {
                action: {
                  label: inbox('openConversation'),
                  onPress: () => router.push({ pathname: '/conversations/[id]', params: { id } }),
                },
              }
            : {}),
        });
      }
    },
    [submit, submitNote, thread, workspace, id, name, toast, inbox, queryClient]
  );
  useEffect(() => {
    deliverRef.current = deliver;
  }, [deliver]);

  /**
   * Sends a reply (its text, and a product or a file), with what the thread
   * said when it was sent: the store's time of its newest message (`after`)
   * and the end of the channel's reply window (`windowEndsAt`). A file whose
   * text cannot go as its caption (`textApart`) goes first, and the text
   * after it, once the store has the file. False when the phone is offline:
   * nothing was sent, and the field keeps the text.
   */
  const reply = useCallback(
    (
      { body, product, file, note, textApart }: ReplyDraft,
      { after, windowEndsAt }: Pick<PendingReply, 'after' | 'windowEndsAt'>
    ): boolean => {
      if (!onlineManager.isOnline()) {
        toast.show({ message: t('notSentOffline'), tone: 'offline' });
        return false;
      }
      const base = {
        createdAt: new Date().toISOString(),
        ...(after ? { after } : {}),
        ...(windowEndsAt ? { windowEndsAt } : {}),
        failed: false,
      };
      const apart = Boolean(file && body && textApart);
      const entry: PendingReply = {
        ...base,
        localId: Crypto.randomUUID(),
        body: apart ? '' : body,
        ...(product ? { product } : {}),
        ...(file ? { file } : {}),
        ...(note ? { note } : {}),
      };
      const text: PendingReply[] = apart
        ? [{ ...base, localId: Crypto.randomUUID(), body, waitsFor: entry.localId }]
        : [];
      updatePendingReplies(thread, (list) => [...list, entry, ...text]);
      void deliver(entry);
      return true;
    },
    [deliver, thread, toast, t]
  );

  const retry = useCallback(
    (localId: string) => {
      const entry = pending.find((candidate) => candidate.localId === localId);
      if (entry) void deliver(entry);
    },
    [pending, deliver]
  );

  /**
   * What the operator sent as one: a file and the text that waits for it (on a
   * channel without captions), whichever of the two is asked about.
   */
  const withFollowers = useCallback(
    (localId: string) => {
      const root = pending.find((entry) => entry.localId === localId)?.waitsFor ?? localId;
      return pending.filter((entry) => entry.localId === root || entry.waitsFor === root);
    },
    [pending]
  );

  /**
   * A reply the store refused, taken back: off the thread, and its words and
   * what it carried back in the draft (a note's in the note's), to change.
   */
  const edit = useCallback(
    (localId: string) => {
      const entries = withFollowers(localId);
      const [first] = entries;
      if (!first || !user || !workspace) return;
      const carried = entries.find((entry) => entry.product || entry.file);
      const kind = first.note ? 'note' : 'reply';
      restoreReplyDraft(replyDraftKey(user.id, workspace, id, kind), workspace, {
        text: entries
          .map((entry) => entry.body)
          .filter(Boolean)
          .join('\n\n'),
        ...(carried
          ? {
              attached: {
                ...(carried.product ? { product: carried.product } : {}),
                ...(carried.file ? { file: carried.file } : {}),
              },
            }
          : {}),
      });
      if (first.note) {
        setNoteMode(replyDraftKey(user.id, workspace, id, 'note'), workspace, true);
      }
      const gone = entries.map((entry) => entry.localId);
      updatePendingReplies(thread, (list) => list.filter((entry) => !gone.includes(entry.localId)));
    },
    [withFollowers, user, workspace, id, thread]
  );

  /** A reply the store refused, let go: off the thread, with what waits for it. */
  const discard = useCallback(
    (localId: string) => {
      const gone = withFollowers(localId).map((entry) => entry.localId);
      updatePendingReplies(thread, (list) => list.filter((entry) => !gone.includes(entry.localId)));
    },
    [withFollowers, thread]
  );

  return { pending, storedIds, reply, retry, edit, discard };
}
