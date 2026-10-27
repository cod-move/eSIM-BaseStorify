import "server-only";

import { ValidationError } from "@/lib/api/errors";
import { recordAttemptGatewayRefs, recordAttemptTry, takeOverOpenAttempt } from "@/lib/checkout/checkout-attempt-store";
import { openGatewayAttempt, type GatewayStartRequest } from "@/lib/checkout/gateway-start/attempt";
import type { GatewayCheckoutRecord } from "@/lib/checkout/gateway-start/types";
import type { CheckoutDraft } from "@/lib/checkout/prepare-checkout";
import { storeCurrencyCode } from "@/lib/payments/gateway-currencies";
import { EXTENSION_METHOD, extensionCheckoutAvailable, newCheckoutReference } from "./service";

export interface ExtensionCheckoutStart {
  record: GatewayCheckoutRecord;
  /** The checkout attempt's `gateway.extensionReference`. */
  reference: string;
  /** The eSIM payment page, where the shopper picks a method. */
  redirectUrl: string;
  resumed: boolean;
}

/**
 * Start paying for a prepared checkout with the extension gateway (patch
 * P15), the way Pesapal's attempt branch does: a checkout attempt holding
 * the order to be, and its reference — then the eSIM payment page. A retry
 * of the same checkout reuses the open attempt and its page.
 *
 * Always an attempt, never a pre-written order, whatever
 * `settings.payment.attemptGateways` says: nothing else ever settles this
 * method, so there are no legacy orders to keep working.
 */
export async function startExtensionCheckout(
  draft: CheckoutDraft,
  options: { pageUrl: (reference: string) => string; request: GatewayStartRequest },
): Promise<ExtensionCheckoutStart> {
  if (!(await extensionCheckoutAvailable(storeCurrencyCode(draft.settings)))) {
    throw new ValidationError("This payment method is not available");
  }

  const reusable = await takeOverOpenAttempt({
    cartId: draft.cart._id,
    paymentMethod: EXTENSION_METHOD,
    fingerprint: draft.attemptFingerprint,
  });
  const existing = String(reusable?.gateway?.extensionReference || "");
  if (reusable && existing) {
    await recordAttemptTry(reusable._id);
    return { record: { kind: "attempt", id: reusable._id, orderNumber: "" }, reference: existing, redirectUrl: options.pageUrl(existing), resumed: true };
  }

  const attempt = await openGatewayAttempt(draft, EXTENSION_METHOD, options.request);
  const reference = newCheckoutReference();
  const redirectUrl = options.pageUrl(reference);
  await recordAttemptGatewayRefs(attempt._id, { extensionReference: reference, checkoutUrl: redirectUrl });
  return { record: { kind: "attempt", id: attempt._id, orderNumber: "" }, reference, redirectUrl, resumed: false };
}
