import {
  clearLastNotificationResponseAsync,
  useLastNotificationResponse,
} from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { readPushData } from '@/features/devices/push-refresh';
import { useMarkNotificationsRead } from '@/features/more/use-notifications';
import { useMe } from '@/features/workspace/use-me';
import { useWorkspace } from '@/features/workspace/use-workspace';

import { useOpenNotification, usePendingNotificationOpen } from './use-open-notification';

/** When this run of the app began: an answer older than this was kept on the device. */
const startedAt = Date.now();

/**
 * Opens the screen of a tapped push notification, the one that started the
 * app included (`useOpenNotification`), and marks the notification read. The
 * store's push carries the dashboard link in `data.url`, its `type` and its
 * `notificationId`. A tap that arrives before the workspace is open (signing
 * in, choosing) waits for it, and for GET /me to have been asked in this run
 * of the app: the copy kept on the device may name a workspace or a
 * capability the operator no longer has. With no answer (offline), the kept
 * copy is all there is, and the screen opens on it.
 *
 * Once handled, the tap is forgotten by the phone too: the app restarts itself
 * when the language changes direction, and must not open it a second time.
 *
 * Mounted once, in the root layout. The browser preview has its own version
 * (`.web.ts`): it receives no notifications.
 */
export function useNotificationOpen(): void {
  const response = useLastNotificationResponse();
  const state = useWorkspace();
  const me = useMe();
  const open = useOpenNotification();
  const { mutate: markRead } = useMarkNotificationsRead();
  const handled = useRef<string | null>(null);
  const meAsked = me.dataUpdatedAt >= startedAt || me.errorUpdatedAt >= startedAt;
  const ready = state.status === 'ready' && meAsked;
  usePendingNotificationOpen();

  useEffect(() => {
    if (!response || !ready) return;
    const { identifier, content } = response.notification.request;
    if (handled.current === identifier) return;
    handled.current = identifier;
    void clearLastNotificationResponseAsync().catch(() => undefined);

    const { url, type, notificationId } = readPushData(content.data);
    // Marking read is a courtesy: the list still shows it unread if this fails.
    if (notificationId) markRead({ ids: [notificationId] });
    if (url) open(url, type ?? undefined);
  }, [response, ready, open, markRead]);
}
