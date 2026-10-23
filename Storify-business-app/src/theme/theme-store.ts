import { create } from 'zustand';

import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export type ThemeMode = 'light' | 'dark';

/** What the operator can pick in settings: a mode, or `system` to follow the phone's light or dark setting. */
export type ThemeChoice = ThemeMode | 'system';

/**
 * The operator's own choice of theme, kept on the device, and the mode the store
 * opens in. A choice of `null` means the operator has not chosen: the app then
 * opens in the store's mode.
 */
type ThemeState = {
  choice: ThemeChoice | null;
  /** The store's mode, from its settings; light until they have arrived. */
  storeMode: ThemeMode;
  choose: (choice: ThemeChoice) => void;
  setStoreMode: (mode: ThemeMode) => void;
};

function read(): ThemeChoice | null {
  const saved = storage.get(STORAGE_KEYS.theme);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : null;
}

export const useThemeStore = create<ThemeState>((set) => ({
  choice: read(),
  storeMode: 'light',
  choose: (choice) => {
    storage.set(STORAGE_KEYS.theme, choice);
    set({ choice });
  },
  setStoreMode: (storeMode) => set({ storeMode }),
}));
