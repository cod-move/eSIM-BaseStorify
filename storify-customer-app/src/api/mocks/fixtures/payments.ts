/** The mock store's data for: paying for an order. */

/**
 * Typed into the order note, a word asks the mock for what the store does only
 * now and then, so each way of paying can be reached from the running app.
 */
export const PAYMENT_SWITCH = {
  /** The order is placed, and the answer is lost on the way back (once per key). */
  lost: 'MOCK-LOST',
  /** The first ask is answered REQUEST_IN_PROGRESS: the first request "is still running". */
  busy: 'MOCK-BUSY',
  /** The first ask is answered 503: Stripe or the store could not start. */
  unavailable: 'MOCK-503',
  /** The payment is still processing for its first two confirms. */
  pending: 'MOCK-PENDING',
  /** The card was not charged. */
  notPaid: 'MOCK-NOTPAID',
  /** The payment came back: it could not become an order. */
  returned: 'MOCK-RETURNED',
  /** The goods sold out meanwhile: refunded. */
  cancelled: 'MOCK-CANCELLED',
} as const;

/** What the courier collects, and what a card is charged, for any order the mock places. */
export const MOCK_ORDER_TOTAL = 129;

/**
 * What the Payment Sheet is started with. The store's own key, name and Stripe
 * account country come from its API; test keys make the wallets test wallets.
 */
export const MOCK_STRIPE = {
  publishableKey: 'pk_test_mock',
  merchantDisplayName: 'Mock Store',
  merchantCountryCode: 'US',
  testMode: true,
} as const;

/** A signed-in shopper's Stripe Customer, with a customer session for their saved cards. */
export const mockStripeCustomer = (userId: string) => ({
  id: `cus_mock_${userId}`,
  customerSessionClientSecret: `cuss_mock_${userId}_secret_mock`,
});

/** How many times a payment answers PENDING before it ends. */
export const PENDING_CONFIRMS = 2;
