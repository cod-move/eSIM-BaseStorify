import { confirmCardPayment, startCardPayment } from '@/api/endpoints/payments';
import { env } from '@/config/env';
import type {
  PlaceOrderRequest,
  StripeConfirmation,
  StripeIntent,
} from '@/contracts/mobile/shop/v1';

import { attemptFor, isFinal, withRetries, type Attempt, type Sleep } from './attempt';
import { presentMockSheet } from './mock-sheet';
import { pendingPayment } from './pending-payment';
import type { FailedReason } from './success-params';
import { presentCardSheet } from './stripe-sheet';
import type { SheetRequest } from './stripe-sheet.types';

/**
 * What a card payment has got to, kept between taps.
 *
 * The intent is made once per attempt: when the sheet is closed or fails, the
 * next tap shows the same client secret again instead of making a new intent
 * (the store allows 5 a quarter of an hour, and refused cards feed its
 * card-testing guard). Once the sheet has paid, the next tap only asks the store
 * how it ended: the money is in, and the shopper must not be asked for it again.
 */
export type CardState = {
  attempt: Attempt | null;
  intent: StripeIntent | null;
  paid: boolean;
};

export const newCardState = (): CardState => ({ attempt: null, intent: null, paid: false });

export type CardOutcome =
  | { kind: 'paid'; orderId: string; orderNumber: string }
  /** Stripe is still confirming: the payment has no order yet. */
  | { kind: 'pending'; paymentIntentId: string }
  | { kind: 'failed'; reason: FailedReason; message?: string }
  /** The shopper closed the sheet. Nothing happened. */
  | { kind: 'cancelled' };

export type CardDeps = {
  present: (request: SheetRequest) => Promise<Awaited<ReturnType<typeof presentCardSheet>>>;
  wait?: Sleep;
};

const defaultDeps: CardDeps = { present: env.apiMock ? presentMockSheet : presentCardSheet };

/** What the store's answer to "how did it end" means for the shopper. */
export function outcomeOf(confirmation: StripeConfirmation, paymentIntentId: string): CardOutcome {
  const { orderId, orderNumber } = confirmation;
  switch (confirmation.outcome) {
    case 'ORDER_PLACED':
      // An order that is placed always has its number; without one, ask again.
      return orderId && orderNumber
        ? { kind: 'paid', orderId, orderNumber }
        : { kind: 'pending', paymentIntentId };
    case 'PENDING':
      return { kind: 'pending', paymentIntentId };
    case 'ORDER_CANCELLED':
      return { kind: 'failed', reason: 'soldOut' };
    case 'PAYMENT_RETURNED':
      return { kind: 'failed', reason: 'returned' };
    case 'NOT_PAID':
      return { kind: 'failed', reason: 'notPaid' };
  }
}

function forget(state: CardState): void {
  state.attempt = null;
  state.intent = null;
  state.paid = false;
  pendingPayment.clear();
}

/**
 * Pays for the order with a card: intent, sheet, confirm. It throws what the
 * store refuses or what could not be reached; the state then says where to
 * carry on from.
 */
export async function payByCard(
  state: CardState,
  input: { locale: string; request: PlaceOrderRequest; billing?: SheetRequest['billing'] },
  deps: CardDeps = defaultDeps
): Promise<CardOutcome> {
  const { locale, request } = input;

  const attempt = attemptFor(state.attempt, request);
  // A form that changed is another payment.
  if (attempt !== state.attempt) {
    state.attempt = attempt;
    state.intent = null;
    state.paid = false;
  }

  if (!state.intent) {
    try {
      state.intent = await withRetries(
        () => startCardPayment(locale, attempt.request, attempt.key),
        deps.wait
      );
    } catch (error) {
      // A refusal freed the key; no answer at all leaves the attempt open.
      if (isFinal(error)) state.attempt = null;
      throw error;
    }
  }
  const intent = state.intent;
  pendingPayment.write(intent.paymentIntentId);

  // What the sheet said when it gave up: only the store knows whether money moved.
  let sheetFailure: { message?: string } | null = null;

  if (!state.paid) {
    const shown = await deps.present({
      publishableKey: intent.publishableKey,
      clientSecret: intent.clientSecret,
      merchantDisplayName: intent.merchantDisplayName,
      merchantCountryCode: intent.merchantCountryCode,
      testMode: intent.testMode,
      customer: intent.customer,
      billing: input.billing,
    });
    if (shown.kind === 'cancelled') {
      // Nothing was charged: nothing is left to ask about when the app starts again.
      pendingPayment.clear();
      return { kind: 'cancelled' };
    }
    if (shown.kind === 'unsupported') {
      forget(state);
      return { kind: 'failed', reason: 'unsupported' };
    }
    if (shown.kind === 'failed') sheetFailure = { message: shown.message };
    else state.paid = true;
  }

  const confirmation = await withRetries(
    () => confirmCardPayment(locale, intent.paymentIntentId),
    deps.wait
  );
  const outcome = outcomeOf(confirmation, intent.paymentIntentId);

  if (sheetFailure && outcome.kind === 'failed' && outcome.reason === 'notPaid') {
    // Not charged, and the intent can be shown again: nothing is left to ask about.
    pendingPayment.clear();
    return { kind: 'failed', reason: 'sheet', message: sheetFailure.message };
  }
  // A payment still pending is Stripe's now: the shopper is told when it ends.
  if (outcome.kind !== 'pending') forget(state);
  return outcome;
}
