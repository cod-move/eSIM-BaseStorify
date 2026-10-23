import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { storage } from './storage';
import { STORAGE_KEYS } from './storage-keys';

/** What the app tells the store about itself with every request. */
export const appInfo = {
  /** The version a shopper sees in the app store, such as `1.4.0`. */
  version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  build: Application.nativeBuildVersion ?? '0',
  platform: Platform.OS,
} as const;

let installId: string | null = null;

/**
 * A random id made the first time the app runs, and removed with the app. The
 * store counts requests against it, so that people behind one shared network
 * address do not use up each other's rate limit. It is not tied to the person
 * or the device.
 */
export function getInstallId(): string {
  if (installId) return installId;

  installId = storage.get(STORAGE_KEYS.installId);
  if (!installId) {
    installId = Crypto.randomUUID();
    storage.set(STORAGE_KEYS.installId, installId);
  }
  return installId;
}
