/** Endpoints: paying on a gateway's own page (the eSIM module, APP-09): PayPal, Pesapal, the eSIM payment page. */
import {
  RedirectPayment,
  RedirectVerification,
  type RedirectPaymentRequest,
  type RedirectVerifyRequest,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';

/**
 * Starts the payment: the page to open and the app link the browser comes
 * back on. The same `idempotencyKey` answers the same payment.
 */
export function startRedirectPayment(
  locale: string,
  body: RedirectPaymentRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      path: '/checkout/redirect',
      method: 'POST',
      body,
      auth: 'optional',
      cart: true,
      idempotencyKey,
    },
    RedirectPayment
  );
}

/** How the payment stands now. Asking again is safe: the answer is the same order. */
export function verifyRedirectPayment(
  locale: string,
  body: RedirectVerifyRequest,
  signal?: AbortSignal
) {
  return api.data(
    {
      locale,
      path: '/checkout/redirect/verify',
      method: 'POST',
      body,
      auth: 'optional',
      cart: true,
      signal,
    },
    RedirectVerification
  );
}
