import { create } from 'zustand';

import { env } from '@/config/env';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { applyDirection } from './direction';

/**
 * The language the app runs in. It is the first part of every API path, the
 * language of the app's own messages and the direction of the layout.
 *
 * `chosen` tells a language the shopper picked in the app from one the app
 * picked for them. A picked one is kept; the other is worked out again at each
 * start from the phone's languages and what the store offers (see
 * features/config/use-locale-sync).
 */
type Stored = {
  locale: string;
  chosen: boolean;
};

type LocaleState = Stored & {
  /** The shopper picked this language. */
  choose: (locale: string) => void;
  /** The app picks a language for a shopper who has not. */
  adopt: (locale: string) => void;
};

function read(): Stored {
  try {
    const saved = JSON.parse(storage.get(STORAGE_KEYS.locale) ?? 'null');
    if (typeof saved?.locale === 'string') {
      return { locale: saved.locale, chosen: saved.chosen === true };
    }
  } catch {
    // Unreadable: start from the default.
  }
  return { locale: env.defaultLocale, chosen: false };
}

export const useLocaleStore = create<LocaleState>((set) => {
  const commit = (next: Stored) => {
    storage.set(STORAGE_KEYS.locale, JSON.stringify(next));
    set(next);
    applyDirection(next.locale);
  };

  return {
    ...read(),
    choose: (locale) => commit({ locale, chosen: true }),
    adopt: (locale) => commit({ locale, chosen: false }),
  };
});

export function useLocale(): string {
  return useLocaleStore((state) => state.locale);
}
