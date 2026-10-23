import { create } from 'zustand';

import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { isAccentId, type AccentId } from './accents';

export type ThemeMode = 'light' | 'dark';

/** What the shopper can pick in settings: a mode, or `system` to follow the phone's light or dark setting. */
export type ThemeChoice = ThemeMode | 'system';

/**
 * The shopper's own choice of theme, kept on the device, and the mode the store
 * opens in. A choice of `null` means the shopper has not chosen: the app then
 * opens in the store's mode.
 */
type ThemeState = {
  choice: ThemeChoice | null;
  /** The store's mode, from its settings; light until they have arrived. */
  storeMode: ThemeMode;
  /** The accent colour the shopper picked, from the fixed list in `accents.ts`; `null` is the store's own colour. */
  accent: AccentId | null;
  choose: (choice: ThemeChoice) => void;
  /** Picks an accent colour, or `null` to go back to the store's. Kept on the device, like the theme. */
  chooseAccent: (accent: AccentId | null) => void;
  setStoreMode: (mode: ThemeMode) => void;
};

function read(): ThemeChoice | null {
  const saved = storage.get(STORAGE_KEYS.theme);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : null;
}

function readAccent(): AccentId | null {
  const saved = storage.get(STORAGE_KEYS.accent);
  return isAccentId(saved) ? saved : null;
}

export const useThemeStore = create<ThemeState>((set) => ({
  choice: read(),
  storeMode: 'light',
  accent: readAccent(),
  choose: (choice) => {
    storage.set(STORAGE_KEYS.theme, choice);
    set({ choice });
  },
  chooseAccent: (accent) => {
    if (accent) storage.set(STORAGE_KEYS.accent, accent);
    else storage.remove(STORAGE_KEYS.accent);
    set({ accent });
  },
  setStoreMode: (storeMode) => set({ storeMode }),
}));
