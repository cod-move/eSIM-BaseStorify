import { useCallback, useState } from 'react';

import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * Whether Home shows its amounts as dots, the eye on its header: for an
 * operator who opens the app where others can see the screen. Remembered on
 * this phone; nothing is sent, and the figures themselves never change.
 */
export function useHiddenAmounts(): [hidden: boolean, toggle: () => void] {
  const [hidden, setHidden] = useState(() => storage.get(STORAGE_KEYS.homeAmountsHidden) === '1');
  const toggle = useCallback(() => {
    const next = !hidden;
    storage.set(STORAGE_KEYS.homeAmountsHidden, next ? '1' : '0');
    setHidden(next);
  }, [hidden]);
  return [hidden, toggle];
}
