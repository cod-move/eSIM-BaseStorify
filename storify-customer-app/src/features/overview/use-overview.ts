import { useQuery } from '@tanstack/react-query';

import { getMeOverview } from '@/api/endpoints/overview';
import { etagQuery, selectData } from '@/api/etag-query';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/** The signed-in shopper's badges and saved products. A guest has none: nothing is asked. */
export function useOverview() {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useQuery({
    queryKey: queryKeys.overview(locale),
    queryFn: etagQuery((options) => getMeOverview(locale, options)),
    select: selectData,
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
}

/** Unread notifications, for the bell and the icon badge. Zero until the store has answered. */
export function useUnreadNotificationCount(): number {
  return useOverview().data?.unreadNotificationCount ?? 0;
}
