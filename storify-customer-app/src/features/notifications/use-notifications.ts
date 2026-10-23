import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getNotifications, markNotificationsRead } from '@/api/endpoints/notifications';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { MarkNotificationsReadRequest } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

const PAGE_SIZE = 20;

/** The shopper's notifications, newest first, a page at a time: all of them, or the unread ones. */
export function useNotifications({ unreadOnly = false }: { unreadOnly?: boolean } = {}) {
  const locale = useLocale();
  const filter = unreadOnly ? { unreadOnly } : {};

  return useInfiniteQuery({
    queryKey: queryKeys.notificationList(locale, filter),
    queryFn: ({ pageParam, signal }) =>
      getNotifications(locale, { ...filter, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.items),
      unreadCount: data.pages[0]?.unreadCount ?? 0,
    }),
    staleTime: STALE.private,
  });
}

/** Marks some notifications, or all of them, read; the list is asked for again. */
export function useMarkNotificationsRead() {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: MarkNotificationsReadRequest) => markNotificationsRead(locale, body),
    // The bell and the icon badge read the overview's count: it falls with the list.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.notifications(locale) }),
        client.invalidateQueries({ queryKey: queryKeys.overview(locale) }),
      ]),
  });
}
