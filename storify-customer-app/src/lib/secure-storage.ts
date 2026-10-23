import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted storage (Keychain on iOS, Keystore on Android) for the two things
 * that stand for a person: the session cookie and the guest cart's token.
 *
 * Reads are synchronous, so a request made on the first frame already carries
 * them. On iOS the Keychain outlives the app: a reinstalled app finds its old
 * values.
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
      // The value is not remembered; the shopper signs in again next time.
    }
  },

  removeItem(key: string): void {
    SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
