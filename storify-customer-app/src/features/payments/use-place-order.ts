import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { placeCodOrder } from '@/api/endpoints/payments';
import { queryKeys } from '@/api/query-keys';
import type { CheckoutPaymentMethod, PlaceOrderRequest } from '@/contracts/mobile/shop/v1';
import { rememberGuestContact } from '@/features/orders/guest-contact';
import { useLocale } from '@/i18n/locale-store';

import { attemptFor, isFinal, withRetries, type Attempt, type Sleep } from './attempt';
import { newCardState, payByCard } from './card-payment';
import { pendingPayment } from './pending-payment';
import { successHref, type PaymentResult } from './success-params';

/**
 * Where an order being placed has got to. It is kept here, out of any screen: a
 * checkout screen that is closed and opened again must still know that a request
 * may be on its way, or went out and was never answered, or the shopper's next
 * tap would place the order twice.
 */
const session = { cash: null as Attempt | null, card: newCardState(), serving: false };
const watchers = new Set<() => void>();

function watch(watcher: () => void) {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
}
const isServing = () => session.serving;

function setServing(serving: boolean) {
  session.serving = serving;
  watchers.forEach((watcher) => watcher());
}

/** Forgets everything the session holds: each test starts from nothing. */
export function resetPaymentSession() {
  session.cash = null;
  session.card = newCardState();
  setServing(false);
}

/** What the shopper has typed, as the Payment Sheet wants it, so it is not asked for twice. */
function billingOf(request: PlaceOrderRequest) {
  const address = request.shippingAddress;
  const name =
    address?.fullName ?? [address?.firstName, address?.lastName].filter(Boolean).join(' ');
  return {
    name: name || undefined,
    email: request.email,
    phone: request.phone ?? address?.phone,
  };
}

/**
 * Places a cash-on-delivery order, under the key of the attempt this form
 * belongs to (see `attempt.ts`): the tap's retries, and a later tap of the same
 * form after an answer was lost, carry the same `Idempotency-Key`, so the store
 * can never place the order twice.
 */
export async function placeCashOrder(
  locale: string,
  request: PlaceOrderRequest,
  wait?: Sleep
): Promise<PaymentResult> {
  const attempt = attemptFor(session.cash, request);
  session.cash = attempt;
  try {
    const order = await withRetries(
      () => placeCodOrder(locale, attempt.request, attempt.key),
      wait
    );
    session.cash = null;
    return { outcome: 'placed', orderId: order.orderId, orderNumber: order.orderNumber };
  } catch (caught) {
    // The store answered: the key is free. No answer: the order may exist, so the key stays.
    if (isFinal(caught)) session.cash = null;
    throw caught;
  }
}

/** Pays by card; `null` when the shopper closed the sheet. */
async function payCard(locale: string, request: PlaceOrderRequest): Promise<PaymentResult | null> {
  const outcome = await payByCard(session.card, { locale, request, billing: billingOf(request) });
  switch (outcome.kind) {
    case 'cancelled':
      return null;
    case 'paid':
      return { outcome: 'paid', orderId: outcome.orderId, orderNumber: outcome.orderNumber };
    case 'pending':
      return { outcome: 'pending', paymentIntentId: outcome.paymentIntentId };
    case 'failed':
      return { outcome: 'failed', reason: outcome.reason, message: outcome.message };
  }
}

/**
 * Places the order, or pays for it, for the method the shopper chose, and opens
 * the outcome screen.
 *
 * - **One tap, one request.** A tap while another is being served is ignored,
 *   from any screen, and `busy` says so.
 * - What the store refuses, or could not be reached for, is `error`: the form
 *   decides what to say (`PRICES_CHANGED` carries the new quote). A shopper who
 *   closes the card sheet is no error.
 */
export function usePlaceOrder() {
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const busy = useSyncExternalStore(watch, isServing);
  const [error, setError] = useState<unknown>(null);

  const place = useCallback(
    async (request: PlaceOrderRequest, method: CheckoutPaymentMethod['id']) => {
      if (session.serving) return;
      setServing(true);
      setError(null);
      try {
        const result =
          method === 'cod' ? await placeCashOrder(locale, request) : await payCard(locale, request);
        if (!result) return;
        // A guest's contact goes with the order (a signed-in shopper sends none): their receipt needs it.
        const contact = request.email ?? request.phone;
        if (contact && 'orderNumber' in result) rememberGuestContact(result.orderNumber, contact);
        // The order took the cart's lines, and joins the history.
        void queryClient.invalidateQueries({ queryKey: queryKeys.cart(locale) });
        // A filter of `{}` matches every filter in a key prefix, so this is every order list.
        void queryClient.invalidateQueries({ queryKey: queryKeys.orderList(locale, {}) });
        router.replace(successHref(result));
      } catch (caught) {
        setError(caught);
      } finally {
        setServing(false);
      }
    },
    [locale, queryClient, router]
  );

  const reset = useCallback(() => setError(null), []);

  return { place, busy, error, reset };
}

/**
 * A card payment left without an outcome (the app was closed after paying, or
 * while the bank was still asking) is asked about before anything else: the
 * outcome screen confirms it with the store. A payment being taken right now is
 * no leftover, and is left alone.
 */
export function useResumePayment() {
  const router = useRouter();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (session.serving) return;
    const paymentIntentId = pendingPayment.read();
    if (paymentIntentId) router.replace(successHref({ outcome: 'pending', paymentIntentId }));
  }, [router]);
}
