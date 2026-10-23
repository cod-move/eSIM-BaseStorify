import { AndroidImportance, setNotificationChannelAsync } from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * The Android channel the store's notifications arrive on. The store names no
 * channel in what it sends, so Expo's push service uses `default`; creating it
 * here gives it the operator's language and a heads-up importance (a new order
 * should not wait in the shade).
 */
export const PUSH_CHANNEL = 'default';

/**
 * Creates the channel, or renames it in the operator's language. Android 13
 * and later show the permission prompt only to an app that has a channel, and
 * Expo wants it before a push token is asked for. Nothing elsewhere.
 */
export async function ensurePushChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(PUSH_CHANNEL, {
    name,
    importance: AndroidImportance.HIGH,
  }).catch(() => null);
}
