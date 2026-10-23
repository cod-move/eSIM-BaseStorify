import { skipToken, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getNotifications, markNotificationsRead } from '@/api/endpoints/notifications';
import { etagPages, nextCursor } from '@/api/etag-query';
import { NOTIFICATION_QUERIES, queryKeys } from '@/api/query-keys';
import type { MarkNotificationsReadRequest, NotificationList } from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/**
 * The operator's notifications (the dashboard bell's), newest first, a page at
 * a time, with `unreadCount` of all for a badge. They are the account's, not a
 * workspace's. A notification's `link` is a dashboard path: `notificationTarget`
 * (lib/links) says which screen it opens.
 */
export function useNotifications({ unreadOnly }: { unreadOnly?: boolean } = {}) {
  const locale = useLocale();
  const { isSignedIn } = useSession();
  const filter = unreadOnly ? { unreadOnly } : {};

  return useInfiniteQuery({
    queryKey: queryKeys.notifications(locale, filter),
    queryFn: isSignedIn
      ? etagPages<NotificationList>((cursor, options) =>
          getNotifications(locale, { ...filter, cursor }, options)
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

/** Marks some notifications (`ids`), or every one (`all: true`), read; the lists are asked again. */
export function useMarkNotificationsRead() {
  const locale = useLocale();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: MarkNotificationsReadRequest) => markNotificationsRead(locale, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERIES }),
  });
}
