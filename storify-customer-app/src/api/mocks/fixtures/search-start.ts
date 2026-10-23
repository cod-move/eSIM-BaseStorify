/** The mock store's data for: the search start page. */
import type { MeSearchStart, SearchStart } from '@/contracts/mobile/shop/v1';

import type { MockUser } from '../state';
import { categoryTree } from './categories';
import { SEEDS, toCard } from './products';
import { savedProductIds } from './wishlist';

/** The terms the mock store typed as trending, in its order. */
const TRENDING = ['linen shirt', 'earbuds', 'pour over', 'running shoes', 'tote bag'];

/** At most this many popular categories, and this many products on the shelf. */
const POPULAR_MAX = 8;
const FOR_YOU_MAX = 12;

export function searchStart(): SearchStart {
  return { trending: TRENDING, popularCategories: categoryTree().slice(0, POPULAR_MAX) };
}

/** The shopper's shelf: the store's products, none they already saved. */
export function meSearchStart(user: MockUser, locale: string): MeSearchStart {
  const saved = savedProductIds(user);
  const forYou = SEEDS.map((seed) => toCard(seed, locale))
    .filter((card) => !saved.has(card.id))
    .slice(0, FOR_YOU_MAX);
  return { forYou };
}
