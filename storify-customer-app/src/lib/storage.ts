// On a phone this installs a `localStorage` kept in SQLite; in a browser it does
// nothing and the browser's own is used. Either way the calls below are
// synchronous, so a value is there on the first render after a restart.
import 'expo-sqlite/localStorage/install';

/**
 * Plain storage for what the app may lose without harm: the cache, the chosen
 * language, the install id. It is not encrypted and is removed with the app.
 * Anything that stands for the shopper or their cart goes in `secure-storage`.
 *
 * Reads and writes never throw: storage that is full or unavailable costs the
 * app a cache, not a crash.
 */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Nothing to do: the value is simply not remembered.
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Already gone, or storage is unavailable.
    }
  },
};
