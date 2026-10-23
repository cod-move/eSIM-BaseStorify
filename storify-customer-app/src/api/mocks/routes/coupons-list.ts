/** The shopper's coupons. */
import { REQUEST_HEADERS, type CouponList } from '@/contracts/mobile/shop/v1';

import { ACCOUNT_CART } from '../fixtures/cart';
import { shopperCoupons } from '../fixtures/coupons-list';
import type { MockContext, MockRoute } from '../kit';
import { state } from '../state';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/coupons', handle: (ctx) => couponList(ctx) },
];

/** Judged against the account's cart when signed in, else the guest's by its token. */
function couponList(ctx: MockContext): CouponList {
  const key = ctx.user ? `user:${ctx.user.id}` : ctx.headers.get(REQUEST_HEADERS.cartToken);
  // An account's cart starts with its sample lines until it is first opened.
  const lines = key
    ? (state.carts.get(key) ?? (ctx.user && !state.seededCarts.has(key) ? ACCOUNT_CART : []))
    : [];
  const cartChecked = lines.length > 0;
  return { items: shopperCoupons(ctx.locale, cartChecked), cartChecked };
}
