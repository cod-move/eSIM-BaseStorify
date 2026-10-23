/** Endpoints: checkout: the quote. Placing an order is in `payments.ts`. */
import { CheckoutQuote, type CheckoutQuoteRequest } from '@/contracts/mobile/shop/v1';

import { api } from '../api';

// A signed-in shopper checks out the account's cart, a guest the cart of the
// token: every checkout request is `auth: 'optional'` and `cart: true`.

/** Prices the order as the form stands. Ask again on every change. */
export function getCheckoutQuote(locale: string, body: CheckoutQuoteRequest, signal?: AbortSignal) {
  return api.data(
    {
      locale,
      path: '/checkout/quote',
      method: 'POST',
      body,
      auth: 'optional',
      cart: true,
      signal,
    },
    CheckoutQuote
  );
}
