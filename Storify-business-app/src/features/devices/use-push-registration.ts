import Constants from 'expo-constants';
import {
  addPushTokenListener,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useTranslations } from 'use-intl';

import { registerDevice, removeDevice } from '@/api/endpoints/devices';
import { DEVICE_PLATFORMS, type DevicePlatform } from '@/contracts/mobile/biz/v1';
import { addSignOutTask } from '@/features/auth/sign-out-tasks';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

import { ensurePushChannel } from './push-channel';

/** Told when the operator grants push permission, so the token is registered at once. */
const granted = new Set<() => void>();

/** The platform push reaches, or `null` where it does not (the browser preview). */
export function pushPlatform(): DevicePlatform | null {
  return DEVICE_PLATFORMS.find((platform) => platform === Platform.OS) ?? null;
}

/**
 * The EAS project Expo's push service knows this app by: the business app's
 * own (`EAS_PROJECT_ID`, app.config.ts), never the shopper app's. A build made
 * without one cannot receive push at all, so it registers nothing.
 */
export function easProjectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

/**
 * Asks for push permission: only from a moment that says why (`usePushPermission`
 * does, for the push moment and the notifications screen), never before
 * sign-in. Resolves to whether notifications are allowed now.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!pushPlatform()) return false;
  const { granted: allowed } = await requestPermissionsAsync();
  if (allowed) granted.forEach((listener) => listener());
  return allowed;
}

/**
 * Registers this phone's push token for the signed-in operator (POST /devices,
 * with the business app's own session and project), again when Expo hands the
 * app a new token, when the language changes (the store's links open in it),
 * when the session changes (the store keeps the phone under the session that
 * registered it, and stops sending to it once that session ends, as a password
 * change that signs out other devices ends this one too), and when the app
 * returns to the front while push was not allowed (the operator may have
 * turned it on in the phone's settings). It never asks for permission.
 * Signing out removes the token first, while the session still allows it, so
 * one operator's notifications never reach the next one's phone.
 */
export function usePushRegistration() {
  const t = useTranslations('push');
  const { user, sessionId } = useSession();
  const locale = useLocale();
  const userId = user?.id;
  const channelName = t('channel');
  const [changes, setChanges] = useState(0);
  /** Who, in which session and language, with which token, the store last accepted. */
  const registered = useRef<string | null>(null);
  /** Whether push was allowed when last checked: a return to the front checks again if not. */
  const allowed = useRef(true);

  useEffect(() => {
    if (!pushPlatform()) return;
    let deviceToken: unknown;
    const changed = () => setChanges((count) => count + 1);
    // Reading the Expo token reports the phone's own token again: only a
    // different one is news.
    const subscription = addPushTokenListener(({ data }) => {
      if (data === deviceToken) return;
      deviceToken = data;
      changed();
    });
    granted.add(changed);
    const foreground = AppState.addEventListener('change', (status) => {
      if (status === 'active' && !allowed.current) changed();
    });
    return () => {
      granted.delete(changed);
      subscription.remove();
      foreground.remove();
    };
  }, []);

  useEffect(() => {
    const platform = pushPlatform();
    const projectId = easProjectId();
    if (!userId || !platform || !projectId) {
      registered.current = null;
      return;
    }

    let active = true;
    let dropTask: (() => void) | undefined;

    const register = async () => {
      const permission = await getPermissionsAsync();
      allowed.current = permission.granted;
      if (!permission.granted || !active) return;
      // Android: the channel exists before the token is asked for (Expo's rule).
      await ensurePushChannel(channelName);
      const { data: token } = await getExpoPushTokenAsync({ projectId });
      if (!active) return;
      // Added before the request: a registration whose answer was lost is still removed.
      dropTask = addSignOutTask(() => {
        registered.current = null;
        return removeDevice(locale, token);
      });
      const key = [userId, sessionId, locale, token].join(' ');
      if (registered.current === key) return;
      await registerDevice(locale, { token, platform });
      registered.current = key;
    };

    // Push is a convenience: a phone without a token (a simulator) or a failed
    // request must not trouble the operator. The next launch or language change retries.
    register().catch(() => undefined);

    return () => {
      active = false;
      dropTask?.();
    };
  }, [userId, sessionId, locale, channelName, changes]);
}
