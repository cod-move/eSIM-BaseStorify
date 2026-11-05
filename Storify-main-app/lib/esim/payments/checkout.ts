import "server-only";

import { ValidationError } from "@/lib/api/errors";
import { recordAttemptGatewayRefs, recordAttemptTry, takeOverOpenAttempt } from "@/lib/checkout/checkout-attempt-store";
import { openGatewayAttempt, type GatewayStartRequest } from "@/lib/checkout/gateway-start/attempt";
import type { GatewayCheckoutRecord } from "@/lib/checkout/gateway-start/types";
import type { CheckoutDraft } from "@/lib/checkout/prepare-checkout";
import { storeCurrencyCode } from "@/lib/payments/gateway-currencies";
import { EXTENSION_METHOD, extensionMethodOptions, newCheckoutReference, startPayment, type StartContext } from "./service";

export interface ExtensionCheckoutStart {
  record: GatewayCheckoutRecord;
  /** The checkout attempt's `gateway.extensionReference`. */
  reference: string;
  /**
   * Where the shopper goes next: the gateway's own page when a method was
   * chosen at checkout and it has one, else the eSIM payment page (to pick a
   * method, or to show a QR code).
   */
  redirectUrl: string;
  resumed: boolean;
}

/**
 * Start paying for a prepared checkout with the extension gateway (patch
 * P15), the way Pesapal's attempt branch does: a checkout attempt holding
 * the order to be, and its reference. A retry of the same checkout reuses
 * the open attempt.
 *
 * With `method` (checkout lists each eSIM method on its own row) the attempt
 * is held to it — the order's fee was priced for it — and the payment starts
 * at once. Without one (the shopper app) the shopper picks on the eSIM
 * payment page.
 *
 * Always an attempt, never a pre-written order, whatever
 * `settings.payment.attemptGateways` says: nothing else ever settles this
 * method, so there are no legacy orders to keep working.
 */
export async function startExtensionCheckout(
  draft: CheckoutDraft,
  options: {
    pageUrl: (reference: string) => string;
    request: GatewayStartRequest;
    method?: string;
    /** Needed with `method`: how the plugin is asked (origin, language, the shopper's browser). */
    start?: StartContext;
  },
): Promise<ExtensionCheckoutStart> {
  const offered = await extensionMethodOptions(storeCurrencyCode(draft.settings));
  if (!offered.length || (options.method && !offered.some((method) => method.code === options.method))) {
    throw new ValidationError({ paymentMethod: ["This payment method is not available. Choose another way to pay."] });
  }

  const reusable = await takeOverOpenAttempt({
    cartId: draft.cart._id,
    paymentMethod: EXTENSION_METHOD,
    fingerprint: draft.attemptFingerprint,
  });
  let reference = String(reusable?.gateway?.extensionReference || "");
  let record: GatewayCheckoutRecord;
  let resumed = false;
  if (reusable && reference) {
    await recordAttemptTry(reusable._id);
    record = { kind: "attempt", id: reusable._id, orderNumber: "" };
    resumed = true;
    // The same order and fee, another method: the attempt follows the shopper's latest choice.
    if (options.method) await recordAttemptGatewayRefs(reusable._id, { extensionMethod: options.method });
  } else {
    const attempt = await openGatewayAttempt(draft, EXTENSION_METHOD, options.request);
    reference = newCheckoutReference();
    record = { kind: "attempt", id: attempt._id, orderNumber: "" };
    await recordAttemptGatewayRefs(attempt._id, { extensionReference: reference, checkoutUrl: options.pageUrl(reference), extensionMethod: options.method });
  }

  const pageUrl = options.pageUrl(reference);
  if (!options.method || !options.start) return { record, reference, redirectUrl: pageUrl, resumed };
  const started = await startPayment(reference, options.method, options.start);
  return { record, reference, redirectUrl: started.pay.kind === "redirect" ? started.pay.data : pageUrl, resumed };
}
