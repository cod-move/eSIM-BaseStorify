import { setBadgeCountAsync } from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { addSignOutTask } from '@/features/auth/sign-out-tasks';
import { useSession } from '@/features/auth/use-session';
import { pushPlatform } from '@/features/devices/use-push-registration';

import { useOverview } from './use-overview';

/**
 * Keeps the app icon's badge at the overview's unread notifications. It is
 * cleared at zero, once the notifications are marked read (the overview is
 * asked again) and when the shopper signs out. Until the store has answered
 * for a signed-in shopper the badge is left as it is.
 */
export function useAppBadge(): void {
  const { isSignedIn } = useSession();
  const unread = useOverview().data?.unreadNotificationCount;
  /** The number last put on the icon, so the same one is not sent twice. */
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const show = (count: number) => {
      if (!pushPlatform() || shown.current === count) return;
      shown.current = count;
      // A launcher that has no badges is no reason for a failure.
      setBadgeCountAsync(count).catch(() => {
        shown.current = null;
      });
    };

    if (!isSignedIn) show(0);
    else if (unread !== undefined) show(unread);

    return addSignOutTask(async () => show(0));
  }, [isSignedIn, unread]);
}
