/** Endpoints: the shopper's wishlist. Adding and removing one product is `setWishlisted` (me.ts). */
import { Wishlist, type WishlistQuery } from '@/contracts/mobile/shop/v1';

import { api } from '../api';

/** One page of the saved products, newest first. */
export function getWishlist(locale: string, query: WishlistQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/wishlist', query, auth: 'user', signal }, Wishlist);
}
