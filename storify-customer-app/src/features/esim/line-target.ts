import type { Href } from 'expo-router';

/**
 * Where a cart or order line of one of the eSIM module's hidden products
 * opens (patch P57). These products are not on the online store — a number,
 * a top-up, balance, a payment fee — so their product page would be "not
 * found". Their slug starts with the product's handle (a clash would add a
 * suffix).
 *
 * Returns the screen to open, `null` for a line that opens nothing, or
 * `undefined` for any other product, which opens its page as usual.
 */
export function esimLineTarget(slug: string | undefined): Href | null | undefined {
  if (!slug) return undefined;
  const handle = HIDDEN.find(([prefix]) => slug === prefix || slug.startsWith(`${prefix}-`));
  return handle ? handle[1] : undefined;
}

/** Longest first: "esim-number-topup" before "esim-number". */
const HIDDEN: [string, Href | null][] = [
  ['esim-number-topup', '/account/esims'],
  ['esim-number', '/esim/numbers'],
  ['esim-topup', '/account/esims'],
  ['wallet-topup', '/account/esims/balance'],
  ['payment-fee', null],
];
