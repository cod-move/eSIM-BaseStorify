import { create } from 'zustand';

import { COMPARE_MAX_PRODUCTS } from '@/contracts/mobile/shop/v1';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * The products the shopper has picked to compare, as the product pages' slugs
 * in column order. It is kept on the phone only: the store keeps no comparison,
 * it answers `GET /compare` for whatever slugs it is sent, as it does for the
 * website's `/compare?products=…`. The most a comparison holds is the store's
 * (`COMPARE_MAX_PRODUCTS`).
 */
const KEY = STORAGE_KEYS.compare;

type CompareTray = {
  slugs: string[];
  /** Adds a product, or takes it out if it is in. Adding to a full tray does nothing: `isFull` says so first. */
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  /** Takes exactly this list: the comparison a link opened, or the products the store still has. */
  replace: (slugs: readonly string[]) => void;
  clear: () => void;
  /** The `?products=` of the link the comparison screen has taken as the pick, while that screen is open. */
  adoptedLink: string | null;
  /** Takes the products of a link as the pick; `null` forgets which link was taken. */
  adopt: (link: string | null) => void;
};

/** The slugs of a link's `?products=`, as the tray would hold them. */
export function slugsOfLink(link: string): string[] {
  return tidy(link.split(','));
}

/** A list of slugs as the tray holds it: text only, each once, no more than a comparison holds. */
function tidy(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const slugs = list
    .filter((slug): slug is string => typeof slug === 'string')
    .map((slug) => slug.trim())
    .filter(Boolean);
  return Array.from(new Set(slugs)).slice(0, COMPARE_MAX_PRODUCTS);
}

/** What storage holds is read as untrusted: anything but a list of strings is dropped. */
function read(): string[] {
  try {
    return tidy(JSON.parse(storage.get(KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export const useCompareTray = create<CompareTray>((set, get) => {
  const commit = (slugs: string[]) => {
    storage.set(KEY, JSON.stringify(slugs));
    set({ slugs });
  };

  return {
    slugs: read(),
    toggle: (slug) => {
      const { slugs } = get();
      if (slugs.includes(slug)) commit(slugs.filter((held) => held !== slug));
      else if (slugs.length < COMPARE_MAX_PRODUCTS) commit([...slugs, slug]);
    },
    remove: (slug) => commit(get().slugs.filter((held) => held !== slug)),
    replace: (slugs) => {
      const next = tidy(slugs);
      const { slugs: held } = get();
      if (next.length !== held.length || next.some((slug, index) => slug !== held[index])) {
        commit(next);
      }
    },
    clear: () => commit([]),
    adoptedLink: null,
    adopt: (link) => {
      if (link !== null) {
        const slugs = slugsOfLink(link);
        storage.set(KEY, JSON.stringify(slugs));
        set({ slugs, adoptedLink: link });
      } else set({ adoptedLink: null });
    },
  };
});

/** Whether a product is picked, and whether the tray has no room for another. */
export function useCompareState(slug: string): { picked: boolean; full: boolean } {
  const picked = useCompareTray((tray) => tray.slugs.includes(slug));
  const full = useCompareTray((tray) => tray.slugs.length >= COMPARE_MAX_PRODUCTS);
  return { picked, full };
}
