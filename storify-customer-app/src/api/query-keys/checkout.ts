import type { CheckoutQuoteRequest } from '@/contracts/mobile/shop/v1';

export const checkoutKeys = {
  /** The quote of the form as it stands: a new request is a new quote. */
  checkoutQuote: (locale: string, request: CheckoutQuoteRequest) =>
    ['private', locale, 'checkout-quote', request] as const,
};
