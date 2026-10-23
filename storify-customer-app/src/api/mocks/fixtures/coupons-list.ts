/** The mock store's data for: the shopper's coupons. */
import type { ShopperCoupon } from '@/contracts/mobile/shop/v1';

import { money } from './shared';

/**
 * The codes the mock store shows to shoppers, judged as the store judges them:
 * usable first. `cartChecked` false leaves out what only a cart decides.
 */
export function shopperCoupons(locale: string, cartChecked: boolean): ShopperCoupon[] {
  const cap = money(300, locale);
  const save10: ShopperCoupon = {
    code: 'SAVE10',
    title: 'Ten off',
    kind: 'PERCENTAGE',
    benefit: '10% off',
    conditions: [`Up to ${cap.formatted} off`, 'Once per customer'],
    maxDiscount: cap,
    usable: true,
  };
  const picks: ShopperCoupon = {
    code: 'PICKS15',
    kind: 'PERCENTAGE',
    benefit: '15% off',
    conditions: ['Selected products only'],
    usable: !cartChecked,
    ...(cartChecked && {
      reason: 'NOT_FOR_THIS_CART',
      reasonMessage: 'Nothing in your cart is covered by this code',
    }),
  };
  const winter: ShopperCoupon = {
    code: 'WINTER25',
    kind: 'FIXED',
    benefit: `${money(250, locale).formatted} off`,
    benefitAmount: money(250, locale),
    conditions: ['Starts 1 Dec', 'Ends 31 Dec'],
    startsAt: '2099-12-01T00:00:00.000Z',
    endsAt: '2099-12-31T23:59:59.000Z',
    usable: false,
    reason: 'NOT_STARTED',
    reasonMessage: 'This code starts on 1 Dec',
  };
  const big: ShopperCoupon = {
    code: 'BIG500',
    kind: 'FIXED',
    benefit: `${money(500, locale).formatted} off`,
    benefitAmount: money(500, locale),
    conditions: [`On orders over ${money(5000, locale).formatted}`],
    minimumSpend: money(5000, locale),
    usable: !cartChecked,
    ...(cartChecked && {
      reason: 'MINIMUM_NOT_MET',
      reasonMessage: `Add items worth ${money(200, locale).formatted} more to unlock`,
      shortBy: money(200, locale),
    }),
  };
  return [save10, picks, winter, big].sort((a, b) => Number(b.usable) - Number(a.usable));
}
