import {
  AndroidImportance,
  getPermissionsAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useTranslations } from 'use-intl';

import { pushPlatform, requestPushPermission } from '@/features/devices/use-push-registration';

/**
 * Whether the phone lets the app send notifications. `unknown` until the phone
 * has answered; `undetermined` when the shopper was never asked.
 */
export type PushPermission = 'unsupported' | 'unknown' | 'granted' | 'denied' | 'undetermined';

/** The channel the store's notifications arrive on (Expo's push service names it `default`). */
const CHANNEL = 'default';

/**
 * The push permission, read again whenever the app comes back to the front, so
 * a change made in the phone's settings shows at once. `request` asks the
 * shopper: call it only from a moment that says why.
 */
export function usePushPermission() {
  const t = useTranslations('notifications');
  const supported = pushPlatform() !== null;
  const [state, setState] = useState<PushPermission>(supported ? 'unknown' : 'unsupported');
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!supported) return;
    const next = await getPermissionsAsync().then(
      (permission): PushPermission => {
        const status: string = permission.status;
        if (permission.granted) return 'granted';
        return status === 'undetermined' ? 'undetermined' : 'denied';
      },
      (): PushPermission => 'unknown'
    );
    if (mounted.current) setState(next);
  }, [supported]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') refresh();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  const request = useCallback(async () => {
    if (!supported) return false;
    if (Platform.OS === 'android') {
      // Android 13 and later show the permission prompt only to an app that
      // already has a notification channel.
      await setNotificationChannelAsync(CHANNEL, {
        name: t('channelName'),
        importance: AndroidImportance.DEFAULT,
      }).catch(() => null);
    }
    const allowed = await requestPushPermission().catch(() => false);
    await refresh();
    return allowed;
  }, [supported, refresh, t]);

  return { state, request, refresh };
}
