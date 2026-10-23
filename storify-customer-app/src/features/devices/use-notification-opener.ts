import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_ACTION_IDENTIFIER,
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
  type NotificationResponse,
} from 'expo-notifications';
import { useRootNavigationState } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { markNotificationsRead } from '@/api/endpoints/notifications';
import { notificationsKeys } from '@/api/query-keys/notifications';
import { useSession } from '@/features/auth/use-session';
import { useOpenLink } from '@/features/config/use-open-link';
import { useLocale } from '@/i18n/locale-store';

import { readPushTarget } from './push-target';
import { pushPlatform } from './use-push-registration';

/**
 * Opens what a tapped notification points to, whether the tap started the app
 * (its last response) or reached it open (a response as it comes): the
 * screen its web path has in the app, else the store's page in the in-app
 * browser. The notification is marked read once a shopper is signed in.
 */
export function useNotificationOpener() {
  const openLink = useOpenLink();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const { user } = useSession();
  const userId = user?.id;
  const locale = useLocale();
  const queryClient = useQueryClient();

  /** The link of the latest tap, until the screens can open it. */
  const pendingUrl = useRef<string | null>(null);
  /** Notifications tapped and not yet marked read. */
  const unread = useRef<string[]>([]);
  const [taps, setTaps] = useState(0);

  useEffect(() => {
    if (!pushPlatform()) return;
    const handled = new Set<string>();

    const take = (response: NotificationResponse) => {
      const { identifier, content } = response.notification.request;
      if (response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER || handled.has(identifier)) {
        return;
      }
      handled.add(identifier);
      // Once handled, a reload of the app must not open it a second time.
      clearLastNotificationResponse();
      const { url, notificationId } = readPushTarget(content.data);
      if (url) pendingUrl.current = url;
      if (notificationId) unread.current.push(notificationId);
      setTaps((count) => count + 1);
    };

    const launchedBy = getLastNotificationResponse();
    if (launchedBy) take(launchedBy);
    const subscription = addNotificationResponseReceivedListener(take);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const url = pendingUrl.current;
    if (!url || !navigationReady) return;
    pendingUrl.current = null;
    openLink(url);
  }, [taps, navigationReady, openLink]);

  useEffect(() => {
    if (!userId || unread.current.length === 0) return;
    const ids = unread.current.splice(0);
    // Marking read is a courtesy: the notification centre still shows it unread if this fails.
    markNotificationsRead(locale, { ids })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: notificationsKeys.notifications(locale) })
      )
      .catch(() => undefined);
  }, [taps, userId, locale, queryClient]);
}
