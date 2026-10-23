/** The mock store's data for: the shopper's wishlist. */
import { state, type MockUser } from '../state';

/** What a shopper finds saved the first time the wishlist is opened, so the grid has something to show. */
const SEEDED = [
  'prod_canvas-weekender-bag',
  'prod_relaxed-linen-shirt',
  'prod_ceramic-pour-over-set',
  'prod_wireless-earbuds-pro',
  'prod_trail-running-shoes',
];

/**
 * The shopper's saved product ids, oldest first. The first look seeds it with
 * a few of the store's products.
 */
export function savedProductIds(user: MockUser): Set<string> {
  let saved = state.wishlists.get(user.id);
  if (!saved) {
    saved = new Set(SEEDED);
    state.wishlists.set(user.id, saved);
  }
  return saved;
}
