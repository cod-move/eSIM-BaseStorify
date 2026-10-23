import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted storage (Keychain on iOS, Keystore on Android) for what stands for
 * the operator: the session cookie, which the auth client keeps here.
 *
 * Reads are synchronous, so a request made on the first frame already carries
 * it. On iOS the Keychain outlives the app: a reinstalled app would find its old
 * values, so the auth client forgets the session on the first run of an
 * install (`lib/auth-client.ts`).
 */
export const secureStorage = {
  getItem(key: string): string | null {
    try {
      return SecureStore.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      SecureStore.setItem(key, value);
    } catch {
      // The value is not remembered; the operator signs in again next time.
    }
  },
};
