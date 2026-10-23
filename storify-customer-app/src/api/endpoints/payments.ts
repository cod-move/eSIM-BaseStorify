/** Endpoints: paying for an order: cash on delivery, and a card through Stripe. */
import {
  PlacedOrder,
  StripeConfirmation,
  StripeIntent,
  type PlaceOrderRequest,
  type StripeIntentRequest,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';

// A signed-in shopper pays for the account's cart, a guest for the cart of the
// token: every request here is `auth: 'optional'` and `cart: true`.

/**
 * Places a cash-on-delivery order. One `idempotencyKey` per attempt: the store
 * performs the request once and answers a repeat with the first order.
 */
export function placeCodOrder(locale: string, body: PlaceOrderRequest, idempotencyKey: string) {
  return api.data(
    {
      locale,
      path: '/checkout/orders',
      method: 'POST',
      body,
      auth: 'optional',
      cart: true,
      idempotencyKey,
    },
    PlacedOrder
  );
}

/**
 * Starts a card payment: what Stripe's Payment Sheet needs. No order exists
 * until the payment is confirmed. The same `idempotencyKey` gets the same
 * PaymentIntent.
 */
export function startCardPayment(
  locale: string,
  body: StripeIntentRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      path: '/checkout/stripe/intent',
      method: 'POST',
      body,
      auth: 'optional',
      cart: true,
      idempotencyKey,
    },
    StripeIntent
  );
}

/**
 * Asks the store how a card payment ended, and has it write the order when
 * Stripe has the money. It takes no key: asking again answers the same order.
 */
export function confirmCardPayment(locale: string, paymentIntentId: string, signal?: AbortSignal) {
  return api.data(
    {
      locale,
      path: '/checkout/stripe/confirm',
      method: 'POST',
      body: { paymentIntentId },
      auth: 'optional',
      cart: true,
      signal,
    },
    StripeConfirmation
  );
}
