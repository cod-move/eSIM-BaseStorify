/** The mock shopper's overview: the counts the other mock routes hold, added up as the store does. */
import type { MeOverview } from '@/contracts/mobile/shop/v1';

import { state, type MockUser } from '../state';
import { ACCOUNT_CART } from './cart';
import { unreadCount } from './notifications';
import { savedProductIds } from './wishlist';

export function overviewFor(user: MockUser): MeOverview {
  const key = `user:${user.id}`;
  // A cart nobody has opened yet holds what the cart route will seed it with.
  const lines = state.carts.get(key) ?? (state.seededCarts.has(key) ? [] : ACCOUNT_CART);
  return {
    cartItemCount: lines.reduce((total, line) => total + line.quantity, 0),
    unreadNotificationCount: unreadCount(),
    // The mock store has no chat yet.
    unreadChatMessageCount: 0,
    wishlistProductIds: [...savedProductIds(user)],
  };
}
