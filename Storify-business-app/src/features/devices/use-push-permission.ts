import { getPermissionsAsync } from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useTranslations } from 'use-intl';

import { ensurePushChannel } from './push-channel';
import { pushPlatform, requestPushPermission } from './use-push-registration';

/**
 * Whether the phone lets the app send notifications: `unsupported` where push
 * does not exist (the browser preview), `unknown` until the phone has
 * answered, `undetermined` while the phone would still ask (never asked, or
 * Android's second chance), `denied` once only its settings can change it.
 */
export type PushPermission = 'unsupported' | 'unknown' | 'granted' | 'denied' | 'undetermined';

/**
 * The push permission, read again whenever the app comes back to the front, so
 * a change made in the phone's settings shows at once. `request` asks the
 * operator (the phone's own prompt): call it only from a moment that says why.
 */
export function usePushPermission() {
  const t = useTranslations('push');
  const supported = pushPlatform() !== null;
  const [state, setState] = useState<PushPermission>(supported ? 'unknown' : 'unsupported');
  const mounted = useRef(true);
  const channelName = t('channel');

  const refresh = useCallback(async () => {
    if (!supported) return;
    const next = await getPermissionsAsync().then(
      (permission): PushPermission => {
        if (permission.granted) return 'granted';
        return permission.status === 'undetermined' || permission.canAskAgain
          ? 'undetermined'
          : 'denied';
      },
      (): PushPermission => 'unknown'
    );
    if (mounted.current) setState(next);
  }, [supported]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') void refresh();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  const request = useCallback(async () => {
    if (!supported) return false;
    // Android 13 and later show the prompt only to an app that has a channel.
    await ensurePushChannel(channelName);
    const allowed = await requestPushPermission().catch(() => false);
    await refresh();
    return allowed;
  }, [supported, refresh, channelName]);

  /** The app's page in the phone's settings: the way back once the phone has refused. */
  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => undefined);
  }, []);

  return { state, request, openSettings };
}
