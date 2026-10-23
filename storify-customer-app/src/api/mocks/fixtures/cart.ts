/** The mock store's data for: the cart. */
import type { StoredLine } from '../state';

/**
 * A guest cart to look at: two sellers, the store's own line, and one line
 * asking for more than is left, so the cart shows a flagged line. On the web,
 * open the app with `?mock-cart=sample` and a new guest starts with it.
 */
export const SAMPLE_CART: readonly StoredLine[] = [
  { productId: 'prod_trail-running-shoes', variantId: 'trail-running-shoes--size-42', quantity: 1 },
  { productId: 'prod_canvas-weekender-bag', quantity: 2 },
  { productId: 'prod_ceramic-pour-over-set', quantity: 1 },
  {
    productId: 'prod_everyday-cotton-tee',
    variantId: 'everyday-cotton-tee--colour-black--size-m',
    quantity: 8,
  },
];

/** What a signed-in shopper finds in the cart the first time it is opened. */
export const ACCOUNT_CART: readonly StoredLine[] = [
  { productId: 'prod_canvas-weekender-bag', quantity: 1 },
  { productId: 'prod_ceramic-pour-over-set', quantity: 1 },
];

/** The page address that asks for the sample cart. */
export const SAMPLE_CART_PARAM = 'mock-cart=sample';
