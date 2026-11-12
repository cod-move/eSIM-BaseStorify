import * as Crypto from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';
import { Linking } from 'react-native';

import { startRedirectPayment, verifyRedirectPayment } from '@/api/endpoints/redirect-payments';
import {
  REDIRECT_PAYMENT_METHODS,
  type PlaceOrderRequest,
  type RedirectPaymentMethod,
  type RedirectVerification,
} from '@/contracts/mobile/shop/v1';
import type { PaymentResult } from '@/features/payments/success-params';

import { redirectPending } from './redirect-pending';
import { redirectStarted } from './redirect-return';

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

/**
 * One key per tap of the form: a retry of the same request is the same payment.
 * The store takes a UUID only.
 */
let current: { key: string; body: string } | null = null;

function keyFor(body: string): string {
  if (current?.body === body) return current.key;
  const key = Crypto.randomUUID();
  current = { key, body };
  return key;
}

/**
 * The app link's query, as the store's bridge passed it on. A query that
 * cannot be read is left out, not thrown: the verify still runs, as it does
 * for a browser closed without coming back.
 */
export function paramsOf(url: string): Record<string, string> | undefined {
  const start = url.indexOf('?');
  if (start < 0) return {};
  try {
    return Object.fromEntries(new URLSearchParams(url.slice(start + 1).split('#')[0]));
  } catch {
    return undefined;
  }
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

/** How long a return link may trail the app coming to the front (P58). */
const LINK_GRACE_MS = 800;

/**
 * The page in the browser, until the shopper is back in the app: the URL of
 * the link back, or `null` when they came back another way.
 *
 * On Android the browser counts as closed as soon as the app is in front
 * again, and the link that brought it there can arrive a moment later: it is
 * listened for here too, and waited for that moment (P58).
 */
async function openPage(url: string, returnUrl: string): Promise<string | null> {
  let heard: string | null = null;
  let onHeard: (() => void) | null = null;
  const subscription = Linking.addEventListener('url', (event) => {
    if (!event.url.startsWith(returnUrl)) return;
    heard = event.url;
    onHeard?.();
  });
  try {
    const session = await openAuthSessionAsync(url, returnUrl);
    if (session.type === 'success') return session.url;
    if (heard === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, LINK_GRACE_MS);
        onHeard = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    return heard;
  } finally {
    subscription.remove();
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
  // [esim-patch] P58 remembered while the page is open: Android may close the app meanwhile.
  redirectStarted.write({ method, reference: payment.reference });
  let link: string | null;
  try {
    link = await openPage(payment.url, payment.returnUrl);
  } finally {
    redirectStarted.clear();
  }
  const cameBack = link !== null;
  const returnParams = link !== null ? paramsOf(link) : undefined;
  const verification = await verifyRedirectPayment(locale, {
    paymentMethod: method,
    reference: payment.reference,
    ...(returnParams ? { returnParams } : {}),
  });
  const result = resultOf(verification, { method, reference: payment.reference });
  // Still being confirmed after the shopper came back from the page: asked about again the next
  // time checkout opens. A page closed without coming back is not kept: nothing may have been paid.
  if (result?.outcome === 'redirect-pending' && cameBack) {
    redirectPending.write({ method, reference: payment.reference });
  }
  return result;
}
