import { setNotificationHandler } from 'expo-notifications';
import { useEffect } from 'react';

import { useNotificationOpener } from '@/features/devices/use-notification-opener';
import { pushPlatform, usePushRegistration } from '@/features/devices/use-push-registration';
import { useAppBadge } from '@/features/overview/use-app-badge';

/**
 * Registers this phone for the signed-in shopper's notifications, opens the
 * screen a tapped one names and keeps the app icon's badge at the unread
 * count. It never asks for permission: the moments that explain why do
 * (requestPushPermission).
 */
export function PushService() {
  usePushRegistration();
  useNotificationOpener();
  useAppBadge();

  useEffect(() => {
    if (!pushPlatform()) return;
    // A notification that arrives while the app is open still shows, so it can be tapped.
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    return () => setNotificationHandler(null);
  }, []);

  return null;
}
