import Constants from 'expo-constants';
import {
  addPushTokenListener,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { registerDevice, removeDevice } from '@/api/endpoints/devices';
import { DEVICE_PLATFORMS, type DevicePlatform } from '@/contracts/mobile/shop/v1';
import { addSignOutTask } from '@/features/auth/sign-out-tasks';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/** Told when the shopper grants push permission, so the token is registered at once. */
const granted = new Set<() => void>();

/** The platform push reaches, or `null` where it does not (the web). */
export function pushPlatform(): DevicePlatform | null {
  return DEVICE_PLATFORMS.find((platform) => platform === Platform.OS) ?? null;
}

/**
 * The EAS project Expo's push service knows the app by. A build made without
 * one (EAS_PROJECT_ID unset, app.config.ts) cannot receive push at all.
 */
function easProjectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

/**
 * Asks for push permission: only from a moment that says why, such as
 * Preferences or the first order's confirmation, never at launch. Resolves to
 * whether notifications are allowed now.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!pushPlatform()) return false;
  const { granted: allowed } = await requestPermissionsAsync();
  if (allowed) granted.forEach((listener) => listener());
  return allowed;
}

/**
 * Registers this phone's push token for the signed-in shopper, again when Expo
 * hands the app a new token, and again when the language changes, so the
 * store's links open in it. A guest registers nothing, and it never asks for
 * permission. Signing out removes the token first, while the session still
 * allows it, so one shopper's notifications never reach the next one's phone.
 */
export function usePushRegistration() {
  const { user } = useSession();
  const locale = useLocale();
  const userId = user?.id;
  const [changes, setChanges] = useState(0);
  /** Who, in which language, with which token, the store last accepted. */
  const registered = useRef<string | null>(null);

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
    return () => {
      granted.delete(changed);
      subscription.remove();
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
      if (!permission.granted || !active) return;
      const { data: token } = await getExpoPushTokenAsync({ projectId });
      if (!active) return;
      // Added before the request: a registration whose answer was lost is still removed.
      dropTask = addSignOutTask(() => {
        registered.current = null;
        return removeDevice(locale, token);
      });
      const key = [userId, locale, token].join(' ');
      if (registered.current === key) return;
      await registerDevice(locale, { token, platform });
      registered.current = key;
    };

    // Push is a convenience: a phone without a token (a simulator) or a failed
    // request must not trouble the shopper. The next launch or language change retries.
    register().catch(() => undefined);

    return () => {
      active = false;
      dropTask?.();
    };
  }, [userId, locale, changes]);
}
