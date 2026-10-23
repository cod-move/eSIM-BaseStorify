import { storage } from './storage';

/**
 * The browser has no Keychain. The web build exists to preview screens while
 * developing, not to ship, so plain storage stands in for the secure one.
 */
export const secureStorage = {
  getItem: (key: string): string | null => storage.get(key),
  setItem: (key: string, value: string): void => storage.set(key, value),
  removeItem: (key: string): void => storage.remove(key),
};
