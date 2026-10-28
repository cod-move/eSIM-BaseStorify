import { openAuthSessionAsync } from 'expo-web-browser';

import { startRedirectPayment, verifyRedirectPayment } from '@/api/endpoints/redirect-payments';
import {
  REDIRECT_PAYMENT_METHODS,
  type PlaceOrderRequest,
  type RedirectPaymentMethod,
  type RedirectVerification,
} from '@/contracts/mobile/shop/v1';
import type { PaymentResult } from '@/features/payments/success-params';

import { redirectPending } from './redirect-pending';

/**
 * Paying on a gateway's own page (APP-09, patch P24): the flow the store's
 * API describes for `redirect` methods — PayPal, Pesapal and the others the
 * store switches on, and the eSIM payment page ("extension").
 *
 * 1. POST /checkout/redirect, with one key per tap.
 * 2. The page in the in-app browser, until it comes back on the app link
 *    (or the shopper closes it).
 * 3. POST /checkout/redirect/verify — also when the browser was closed
 *    without coming back: the money may have moved.
 */

export function isRedirectMethod(method: string): method is RedirectPaymentMethod {
  return (REDIRECT_PAYMENT_METHODS as readonly string[]).includes(method);
}

/** One key per tap of the form: a retry of the same request is the same payment. */
let current: { key: string; body: string } | null = null;

function keyFor(body: string): string {
  if (current?.body === body) return current.key;
  const key = `redirect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  current = { key, body };
  return key;
}

/** The app link's query, as the store's bridge passed it on. */
function paramsOf(url: string): Record<string, string> {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [name = '', value = ''] = pair.split('=');
    if (name) params[decodeURIComponent(name)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return params;
}

/** The verify's answer as the outcome screen is told; `null` when the shopper gave up. */
export function resultOf(
  verification: RedirectVerification,
  pending: { method: RedirectPaymentMethod; reference: string }
): PaymentResult | null {
  switch (verification.status) {
    case 'PAID':
      return verification.orderNumber
        ? {
            outcome: 'paid',
            orderNumber: verification.orderNumber,
            ...(verification.orderId ? { orderId: verification.orderId } : {}),
          }
        : { outcome: 'redirect-pending', ...pending };
    case 'PENDING':
      return { outcome: 'redirect-pending', ...pending };
    case 'CANCELLED':
      if (verification.refunded) return { outcome: 'failed', reason: 'returned' };
      return verification.reason === 'PAYER_CANCELLED'
        ? null
        : { outcome: 'failed', reason: 'notPaid' };
    case 'FAILED':
      return { outcome: 'failed', reason: 'notPaid' };
  }
}

/** Pays on the gateway's page; `null` when the shopper gave up there. */
export async function payByRedirect(
  locale: string,
  request: PlaceOrderRequest,
  method: RedirectPaymentMethod
): Promise<PaymentResult | null> {
  const body = { ...request, paymentMethod: method };
  const payment = await startRedirectPayment(locale, body, keyFor(JSON.stringify(body)));
  current = null;
  const session = await openAuthSessionAsync(payment.url, payment.returnUrl);
  const returnParams = session.type === 'success' ? paramsOf(session.url) : undefined;
  const verification = await verifyRedirectPayment(locale, {
    paymentMethod: method,
    reference: payment.reference,
    ...(returnParams ? { returnParams } : {}),
  });
  const result = resultOf(verification, { method, reference: payment.reference });
  // Still being confirmed: asked about again the next time checkout opens.
  if (result?.outcome === 'redirect-pending')
    redirectPending.write({ method, reference: payment.reference });
  return result;
}
