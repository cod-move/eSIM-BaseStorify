import { CouponList } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/**
 * The codes the store offers this shopper, judged for the cart they have now:
 * the account's when signed in, else the guest's by its token.
 */
export function getCouponList(locale: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: '/coupons', auth: 'optional', cart: true, etag, signal },
    CouponList
  );
}
