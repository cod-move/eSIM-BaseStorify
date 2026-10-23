import { useQuery } from '@tanstack/react-query';

import { getChatConversations, getChatDraft } from '@/api/endpoints/chat';
import { etagQuery, selectData } from '@/api/etag-query';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { LIST_MAX_LIMIT, type ChatDraftQuery } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useOverview } from '@/features/overview/use-overview';
import { useLocale } from '@/i18n/locale-store';

/** How often an open list asks again: an unchanged list answers 304 before the store reads it. */
export const POLL_MS = 5000;

const PAGE_SIZE = LIST_MAX_LIMIT;

/** The store's own support: no product, no seller. */
const STORE_DRAFT: ChatDraftQuery = {};

/**
 * Whether the store takes chats. The store sends no flag for it: the draft of a
 * chat with the store itself says so. A guest, or an answer not yet in, is "no".
 */
export function useChatAvailable(): boolean {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  const draft = useQuery({
    queryKey: queryKeys.chatDraft(locale, STORE_DRAFT),
    queryFn: ({ signal }) => getChatDraft(locale, STORE_DRAFT, signal),
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
  return draft.data?.available === true;
}

/** Unread chat messages, for the button and the tile. Zero until the store has answered. */
export function useUnreadChatCount(): number {
  return useOverview().data?.unreadChatMessageCount ?? 0;
}

/**
 * The shopper's conversations, most recent activity first. While `polling` (the
 * screen is in front) it asks again every few seconds, with the last ETag.
 */
export function useConversations(polling: boolean) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.chatConversations(locale),
    queryFn: etagQuery((options) => getChatConversations(locale, { limit: PAGE_SIZE }, options)),
    select: selectData,
    refetchInterval: polling ? POLL_MS : false,
    staleTime: STALE.private,
  });
}
