import {
  onlineManager,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  addNote,
  getConversationAssignees,
  getConversationMessages,
  getConversations,
  markConversationRead,
  sendAttachment,
  sendMessage,
  setConversationAssignment,
  setConversationStatus,
} from '@/api/endpoints/inbox';
import { NetworkError, isApiError } from '@/api/errors';
import { etagPages, nextCursor, type CachedPages } from '@/api/etag-query';
import { useKeyedMutation } from '@/api/keyed-mutation';
import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import type {
  Conversation,
  ConversationList,
  ConversationListQuery,
  ConversationMessage,
  ConversationMessages,
  ConversationStatusRequest,
} from '@/contracts/mobile/biz/v1';
import type { SelectedUploadFile } from '@/features/uploads/selected-file';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

/**
 * What the conversation list is filtered by: one customer's with
 * `customerId`, the operator's own or nobody's with `assignee`.
 */
export type ConversationFilter = Pick<
  ConversationListQuery,
  'status' | 'unreadOnly' | 'search' | 'customerId' | 'assignee'
>;

/**
 * The workspace's conversations, the most recent message first, a page at a
 * time, with `unreadCount` (every conversation's, for the tab's badge). Read
 * again when there may be news of it: a `chat_message` push, a pull to
 * refresh, the operator's own reply or read, and the app's return to the
 * front (a push that came while it was away was never heard, and Home's
 * unread count is read then too). Never on a timer, by design. An
 * unchanged list is a 304.
 */
export function useConversations(filter: ConversationFilter = {}) {
  const scope = useWorkspaceScope();

  return useInfiniteQuery({
    queryKey: queryKeys.conversationList(scope, filter),
    queryFn: scope
      ? etagPages<ConversationList>((cursor, options) =>
          getConversations(scope, { ...filter, cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.data.items),
      unreadCount: data.pages[0]?.data.unreadCount ?? 0,
    }),
  });
}

/**
 * Whether the store's refusal of a read stands: asking again every few
 * seconds would only be refused again (a conversation gone or out of reach,
 * a workspace no longer theirs). No answer, the store's fault and "too many
 * requests" pass.
 */
export function isFinalRefusal(error: unknown): boolean {
  return isApiError(error) && error.status < 500 && error.status !== 429;
}

/**
 * One conversation and its messages, newest first; more pages go back in
 * time. `pollMs` asks again while the thread is open (every 3 to 5 seconds;
 * an unchanged thread is a 304); pass `false` when the screen loses focus.
 * It stops while the last read met a refusal that stands (`isFinalRefusal`):
 * a pull, the foreground or the screen's "Try again" asks once more.
 */
export function useConversationMessages(id: string, { pollMs }: { pollMs?: number | false } = {}) {
  const scope = useWorkspaceScope();

  return useInfiniteQuery({
    queryKey: queryKeys.conversationMessages(scope, id),
    queryFn: scope
      ? etagPages<ConversationMessages>((cursor, options) =>
          getConversationMessages(scope, id, { cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    refetchInterval: (query) => (isFinalRefusal(query.state.error) ? false : (pollMs ?? false)),
    select: (data) => ({
      conversation: data.pages[0]?.data.conversation,
      messages: data.pages.flatMap((page) => page.data.items),
      /** How many pages are held: every read asks for each of them again. */
      pages: data.pages.length,
    }),
  });
}

/**
 * The thread held in the cache, with its newest page changed by `change`. The
 * page loses its validator: it no longer is the copy the store tagged, and a
 * 304 to that tag would keep this edit for good. The next read is answered in
 * full and replaces it with the store's own.
 */
function changeNewestPage(
  held: CachedPages<ConversationMessages> | undefined,
  change: (page: ConversationMessages) => ConversationMessages
): CachedPages<ConversationMessages> | undefined {
  const [newest, ...older] = held?.pages ?? [];
  if (!held || !newest) return held;
  return { ...held, pages: [{ data: change(newest.data) }, ...older] };
}

/**
 * Sends a text reply. `localId` is the screen's own id for the message (the
 * row it shows as "sending" until the answer replaces it): each message gets
 * its own `Idempotency-Key`, kept for its retries, so a reply is never sent
 * twice and two replies can be on their way at once. The message the store
 * answers goes into the thread at once; the conversation is read again (the
 * answer to a retried key is the first one's, replayed, and may be stale).
 *
 * A reply may share a product (`productId`) or carry one file (`file`, to
 * POST …/attachments, with the text as its caption).
 *
 * Refusals: `REPLY_WINDOW_CLOSED` (409: a template is needed, sent from the
 * website), `CONVERSATION_CLOSED` (409), `PRODUCT_NOT_AVAILABLE` (409),
 * `ATTACHMENT_NOT_ACCEPTED` (400).
 */
/** One reply: its text, and a product or a file with it. */
type SendRequest = {
  body: string;
  localId: string;
  productId?: string;
  file?: SelectedUploadFile;
};

export function useSendMessage(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useKeyedMutation({
    attemptKey: (request: SendRequest) => ['message', scope?.workspace, id, request.localId],
    send: ({ body, productId, file }, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      if (file) {
        return sendAttachment(
          scope,
          id,
          { file: file.blob, filename: file.filename, body },
          idempotencyKey
        );
      }
      return sendMessage(scope, id, { body, ...(productId ? { productId } : {}) }, idempotencyKey);
    },
    onSuccess: (result) => showMessage(queryClient, scope, id, result.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationMessages(scope, id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationLists(scope) });
    },
  });
}

/** Puts a message the store answered at the bottom of the thread held, once. */
function showMessage(
  queryClient: QueryClient,
  scope: WorkspaceScope | null,
  id: string,
  sent: ConversationMessage
) {
  queryClient.setQueryData<CachedPages<ConversationMessages>>(
    queryKeys.conversationMessages(scope, id),
    (held) =>
      changeNewestPage(held, (page) =>
        page.items.some((message) => message.id === sent.id)
          ? page
          : { ...page, items: [sent, ...page.items] }
      )
  );
}

/**
 * Writes an internal note (POST …/notes): words only the team reads, never
 * sent to the customer. Keyed per note, as a reply is (`localId`, the row it
 * shows as "saving" until the answer replaces it), so a retry writes it once.
 * The note the store answers goes into the thread at once. It changes nothing
 * a list shows (its last message is the customer's or a reply), so only the
 * thread is read again.
 */
export function useAddNote(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useKeyedMutation({
    attemptKey: (request: { body: string; localId: string }) => [
      'note',
      scope?.workspace,
      id,
      request.localId,
    ],
    send: ({ body }, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return addNote(scope, id, { body }, idempotencyKey);
    },
    onSuccess: (result) => showMessage(queryClient, scope, id, result.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationMessages(scope, id) });
    },
  });
}

/**
 * Who the conversation may be given to (the `assign` action): asked only
 * while `enabled` (the sheet is open and the store offers `assign`).
 */
export function useConversationAssignees(id: string, { enabled }: { enabled: boolean }) {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.conversationAssignees(scope, id),
    queryFn:
      scope && enabled ? ({ signal }) => getConversationAssignees(scope, id, signal) : skipToken,
  });
}

/**
 * A change to the conversation itself (who has it, its status): the answer
 * is the conversation, shown in the thread at once; the thread and every
 * list are read again (a list filtered by status or assignee moves). Plain,
 * not keyed: each sets a value, and setting it again changes nothing. Never
 * held back offline: it fails at once with a `NetworkError`.
 */
function useConversationChange<TRequest>(
  id: string,
  change: (scope: WorkspaceScope, request: TRequest) => Promise<Conversation>
) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: TRequest) => {
      if (!scope) throw new Error('No workspace yet');
      if (!onlineManager.isOnline()) throw new NetworkError('offline');
      return change(scope, request);
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData<CachedPages<ConversationMessages>>(
        queryKeys.conversationMessages(scope, id),
        (held) => changeNewestPage(held, (page) => ({ ...page, conversation }))
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationMessages(scope, id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationLists(scope) });
      // Who may take it may have changed too (a refusal says so); asked again when next shown.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationAssignees(scope, id) });
    },
  });
}

/**
 * Gives the conversation to someone in the team (`assign`), to the operator
 * themselves (their GET /me `id`: `claim`), or to nobody (`null`).
 * `ASSIGNEE_NOT_AVAILABLE` (409): that person can no longer take it; the
 * team is read again.
 */
export function useAssignConversation(id: string) {
  return useConversationChange(id, (scope, assigneeId: string | null) =>
    setConversationAssignment(scope, id, { assigneeId })
  );
}

/**
 * Resolves the conversation, or opens it again. `STATUS_CHANGE_NOT_ALLOWED`
 * (409): it was closed or marked spam meanwhile; the thread read again says so.
 */
export function useConversationStatus(id: string) {
  return useConversationChange(id, (scope, status: ConversationStatusRequest['status']) =>
    setConversationStatus(scope, id, { status })
  );
}

/**
 * Marks the customer's messages in a conversation read: when the thread opens,
 * and after new inbound messages show. The thread on screen, the badge and
 * Home's figure follow.
 */
export function useMarkConversationRead(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!scope) throw new Error('No workspace yet');
      return markConversationRead(scope, id);
    },
    onSuccess: () => {
      queryClient.setQueryData<CachedPages<ConversationMessages>>(
        queryKeys.conversationMessages(scope, id),
        (held) =>
          changeNewestPage(held, (page) => ({
            ...page,
            conversation: { ...page.conversation, unreadCount: 0 } satisfies Conversation,
          }))
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationLists(scope) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home(scope) });
    },
  });
}
