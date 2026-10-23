import type { PaymentSheet } from '@stripe/stripe-react-native';

import { loadStripe } from './stripe-module';
import { appScheme, stripeReturnUrl } from './stripe-return';
import type { SheetRequest, SheetResult } from './stripe-sheet.types';

/** Whether Stripe has been set up since the app started: a bank's way back is Stripe's only then. */
let ready = false;

/** Forgets that Stripe was set up: each test starts from nothing. */
export function resetStripe(): void {
  ready = false;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '');

/**
 * What `initPaymentSheet` is given, as the store's intent says.
 *
 * Apple Pay and Google Pay are offered only when the intent carries the Stripe
 * account's country; the sheet still hides a wallet the phone cannot use. A
 * signed-in shopper's `customer` lets the sheet list and reuse their saved
 * cards, with the customer session's secret when it is sent, else the ephemeral
 * key's. The store never sends a guest one. Without these fields the sheet
 * takes a card, as it always did.
 */
export function sheetParams(request: SheetRequest, returnURL: string): PaymentSheet.SetupParams {
  const { merchantCountryCode, customer } = request;
  const base: PaymentSheet.SetupParamsBase = {
    paymentIntentClientSecret: request.clientSecret,
    merchantDisplayName: request.merchantDisplayName,
    // Where the bank's check sends the shopper back to, before the sheet ends.
    returnURL,
    defaultBillingDetails: request.billing,
    ...(merchantCountryCode
      ? {
          applePay: { merchantCountryCode },
          googlePay: { merchantCountryCode, testEnv: request.testMode },
        }
      : {}),
  };
  if (customer?.customerSessionClientSecret) {
    return {
      ...base,
      customerId: customer.id,
      customerSessionClientSecret: customer.customerSessionClientSecret,
    };
  }
  if (customer?.ephemeralKeySecret) {
    return {
      ...base,
      customerId: customer.id,
      customerEphemeralKeySecret: customer.ephemeralKeySecret,
    };
  }
  return base;
}

/**
 * Stripe's Payment Sheet, on a phone. The sheet collects the card and confirms
 * the payment with Stripe; the store is asked how it ended afterwards.
 *
 * Stripe is set up here, with the key of the intent the store just made, and
 * not by a `StripeProvider` at the root: the store's config carries no key, and
 * the key belongs to the store's Stripe account, not to the app.
 *
 * It never throws: whatever goes wrong on the device is a sheet that failed,
 * and the store is asked whether money moved.
 */
export async function presentCardSheet(request: SheetRequest): Promise<SheetResult> {
  const stripe = await loadStripe();
  if (!stripe) return { kind: 'unsupported' };

  try {
    const urlScheme = appScheme();
    // The store's own key, as its intent sent it. Set up for every payment: the
    // activity Stripe hangs its views on may have been made again since the last.
    await stripe.initStripe({ publishableKey: request.publishableKey, urlScheme });
    ready = true;

    const prepared = await stripe.initPaymentSheet(
      sheetParams(request, stripeReturnUrl(urlScheme))
    );
    if (prepared.error) return { kind: 'failed', message: prepared.error.message };

    const presented = await stripe.presentPaymentSheet();
    if (!presented.error) return { kind: 'paid' };
    if (presented.error.code === stripe.PaymentSheetError.Canceled) return { kind: 'cancelled' };
    return { kind: 'failed', message: presented.error.message };
  } catch (error) {
    return { kind: 'failed', message: messageOf(error) };
  }
}

/**
 * Hands Stripe the address a bank sent the shopper back on (iOS: the sheet
 * finishes only once it has it). Android's sheet comes back by itself.
 */
export async function handleStripeReturn(url: string): Promise<void> {
  if (!ready) return;
  const stripe = await loadStripe();
  try {
    await stripe?.handleURLCallback(url);
  } catch {
    // An address Stripe does not want is no payment's business.
  }
}
