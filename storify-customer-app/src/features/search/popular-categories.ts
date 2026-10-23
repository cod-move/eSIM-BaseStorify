import type { Category } from '@/contracts/mobile/shop/v1';

/** How many tiles "Popular Category" shows: five rows of two. "View All" opens the rest. */
const TILES = 10;

/**
 * The tiles of "Popular Category". The sub-categories come first, the more
 * particular things a shopper looks for; then the store's other categories,
 * the top level and then each level under it, until there are ten. A store
 * with fewer shows all it has, and none shows twice.
 */
export function popularCategories(tree: Category[]): Category[] {
  const levels: Category[] = [];
  for (let level = tree; level.length > 0; level = level.flatMap((c) => c.children)) {
    levels.push(...level);
  }
  const subCategories = tree.flatMap((category) => category.children);

  const tiles = new Map<string, Category>();
  for (const category of [...subCategories, ...levels]) {
    if (tiles.size === TILES) break;
    if (!tiles.has(category.id)) tiles.set(category.id, category);
  }
  return [...tiles.values()];
}
