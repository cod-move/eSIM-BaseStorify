/**
 * The features the app knows, and whether this release has each.
 *
 * The API's contract has no list of capabilities, so the app answers from its
 * own defaults: the v1 features are on, those of a later release are off. A
 * screen that will gain one of the later features asks `useCapability` at the
 * spot, so nothing of it is shown half-built before then. When the API starts
 * to send capabilities, only this file changes.
 */
export const CAPABILITIES = {
  // v1: on wherever the app runs.
  'checkout.stripe': true,
  'checkout.cashOnDelivery': true,
  'checkout.coupons': true,
  'orders.guestTracking': true,
  'orders.returns': true,
  'reviews.write': true,
  'reviews.mine': true,
  'support.chat': true,
  // v1.1.
  'auth.apple': false,
  'auth.sessions': false,
  'checkout.paypal': false,
  'checkout.razorpay': false,
  'checkout.paystack': false,
  'checkout.pesapal': false,
  'checkout.pickup': false,
  'products.preOrder': false,
  'products.quotes': false,
  'vendors.follow': false,
  'support.contactForm': false,
  'support.assistant': false,
  'account.loyalty': false,
  'orders.downloads': false,
  // v1.2.
  'checkout.mobileMoney': false,
} as const satisfies Record<string, boolean>;

export type Capability = keyof typeof CAPABILITIES;

/** Whether this release of the app has the feature. */
export function useCapability(name: Capability): boolean {
  return CAPABILITIES[name];
}

/**
 * The same question for a list: `items.filter((item) => has(item.capability))`.
 * An item without a capability is always there.
 */
export function useCapabilities(): (name: Capability | undefined) => boolean {
  return has;
}

function has(name: Capability | undefined): boolean {
  return name === undefined || CAPABILITIES[name];
}
