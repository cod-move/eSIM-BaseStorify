import type { StripeIntent } from '@/contracts/mobile/shop/v1';

/** What the Payment Sheet is opened with: the store's intent, as it sent it. */
export type SheetRequest = Pick<
  StripeIntent,
  | 'publishableKey'
  | 'clientSecret'
  | 'merchantDisplayName'
  | 'merchantCountryCode'
  | 'testMode'
  | 'customer'
> & {
  /** From the checkout form, so the shopper does not type them twice. */
  billing?: { name?: string; email?: string; phone?: string };
};

/**
 * How the sheet closed.
 * - `paid`: Stripe has the payment. The store still has to say it became an order.
 * - `cancelled`: the shopper closed it; the same client secret can be shown again.
 * - `failed`: Stripe's own sentence says why; the same client secret can be shown again.
 * - `unsupported`: this device cannot show the sheet (the web build).
 */
export type SheetResult =
  | { kind: 'paid' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string }
  | { kind: 'unsupported' };
