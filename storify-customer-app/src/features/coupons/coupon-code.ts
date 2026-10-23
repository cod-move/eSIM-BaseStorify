import type { CheckoutCoupon } from '@/contracts/mobile/shop/v1';

/**
 * The code an order may be placed with. The store prices a refused coupon as
 * if it were not there, and placing with it is answered `COUPON_INVALID`, so a
 * code the last quote marked `INVALID` is dropped before placing. The shopper
 * still sees the refusal; the order just goes without the coupon.
 */
export function couponCodeToPlace(
  code: string | undefined,
  coupon: CheckoutCoupon | undefined
): string | undefined {
  const typed = code?.trim();
  if (!typed) return undefined;
  const refused =
    coupon?.status === 'INVALID' && coupon.code.trim().toUpperCase() === typed.toUpperCase();
  return refused ? undefined : typed;
}
