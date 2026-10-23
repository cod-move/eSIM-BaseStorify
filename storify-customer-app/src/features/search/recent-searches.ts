import { create } from 'zustand';

import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * What the shopper searched for lately, newest first. It is kept on the phone
 * only and never sent to the store.
 */
const KEY = STORAGE_KEYS.recentSearches;
const LIMIT = 10;

type RecentSearches = {
  terms: string[];
  /** Puts a term first, once: searching for it again moves it to the front. */
  add: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
};

/** What storage holds is read as untrusted: anything but a list of strings is dropped. */
function read(): string[] {
  try {
    const saved: unknown = JSON.parse(storage.get(KEY) ?? '[]');
    return Array.isArray(saved)
      ? saved.filter((term): term is string => typeof term === 'string').slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

export const useRecentSearches = create<RecentSearches>((set, get) => {
  const commit = (terms: string[]) => {
    storage.set(KEY, JSON.stringify(terms));
    set({ terms });
  };
  const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

  return {
    terms: read(),
    add: (term) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      commit([trimmed, ...get().terms.filter((t) => !same(t, trimmed))].slice(0, LIMIT));
    },
    remove: (term) => commit(get().terms.filter((t) => t !== term)),
    clear: () => commit([]),
  };
});
