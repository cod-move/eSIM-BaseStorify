import "server-only";

import type { CheckoutQuote, RedirectVerification } from "@/contracts/mobile/shop/v1/checkout";
import type { GatewayStartRequest } from "@/lib/checkout/gateway-start/attempt";
import type { GatewayCheckoutRecord } from "@/lib/checkout/gateway-start/types";
import type { CheckoutDraft } from "@/lib/checkout/prepare-checkout";
import { appBaseUrl } from "@/lib/app-url";
import { buildLocalePath } from "@/lib/i18n/locale-prefix";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { isValidAppScheme } from "@/lib/settings/mobile-app";
import { CheckoutAttempt, CHECKOUT_ATTEMPT_STATUS, Order } from "@/models";
import { EsimPayment } from "@/models/esim-payment.model";
import { startExtensionCheckout } from "./checkout";
import { extensionMethodNames, settlePayment } from "./service";
import { publicCheckoutDisplay } from "@/lib/esim/admin/checkout-display";
import { appDisplayRank } from "./checkout-display";

/**
 * Extension payments in the shopper app (APP-09, patch P15): the "redirect"
 * flow the app already has for PayPal and the like. The in-app browser
 * opens the eSIM payment page in app mode, which sends the browser to the
 * store's return bridge — and so back to the app — once the payment is
 * confirmed or the shopper gives up; the app then verifies.
 */

/**
 * Adds "extension" to a quote's methods when a method is on, the app has a way
 * back, and nothing is pre-ordered; then lists the methods in the order set
 * for checkout (patch P34), "extension" where the first eSIM method is.
 */
export async function withExtensionMethod(
  quote: CheckoutQuote,
  options: { appScheme: string; currency: string; hasPreorder: boolean },
): Promise<CheckoutQuote> {
  const display = await publicCheckoutDisplay();
  const ordered = (methods: CheckoutQuote["paymentMethods"]) =>
    methods
      .map((method, index) => ({ method, index, rank: appDisplayRank(display, method.id) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.method);
  if (options.hasPreorder) return { ...quote, paymentMethods: ordered(quote.paymentMethods) };
  const names = await extensionMethodNames(options.currency);
  if (!names.length) return { ...quote, paymentMethods: ordered(quote.paymentMethods) };
  return {
    ...quote,
    paymentMethods: ordered([
      ...quote.paymentMethods,
      isValidAppScheme(options.appScheme)
        ? { id: "extension", flow: "redirect", name: names.join(" · "), available: true }
        : { id: "extension", flow: "redirect", name: names.join(" · "), available: false, reason: "NOT_CONFIGURED", message: "This payment method is not available" },
    ]),
  };
}

/** The redirect start: an attempt and the eSIM payment page, in app mode, in the shopper's language. */
export async function startExtensionRedirect(
  draft: CheckoutDraft,
  ctx: { locale: string; request: GatewayStartRequest },
): Promise<{ record: GatewayCheckoutRecord; gatewayUrl: string; resumed: boolean }> {
  const { storeDefault } = await getLocaleRouting();
  const start = await startExtensionCheckout(draft, {
    pageUrl: (reference) => `${appBaseUrl()}${buildLocalePath(ctx.locale, `/esim/pay/${reference}`, storeDefault)}?app=1`,
    request: ctx.request,
  });
  return { record: start.record, gatewayUrl: start.redirectUrl, resumed: start.resumed };
}

/**
 * The verify, for a checkout not yet an order (Storify answers PAID itself
 * once it is): a paid payment not yet turned into the order is settled now;
 * otherwise it is still being paid, or the shopper gave up.
 */
export async function verifyExtensionRedirect(checkoutRef: string | undefined, gaveUp: boolean): Promise<RedirectVerification> {
  if (!checkoutRef) return { status: "FAILED", reason: "NOT_COMPLETED" };
  const paid = await EsimPayment.findOne({ checkoutRef, state: "paid" }).sort({ paidAt: 1 }).select("_id").lean();
  if (paid) {
    let outcome;
    try {
      outcome = await settlePayment(String(paid._id));
    } catch {
      return { status: "PENDING" };
    }
    const settled = await EsimPayment.findById(paid._id).select("settlement").lean();
    const orderId = settled?.settlement?.orderId ? String(settled.settlement.orderId) : null;
    if (outcome === "closed") return { status: "CANCELLED", reason: "CHECKOUT_CLOSED", refunded: true };
    if (outcome && orderId) {
      const order = await Order.findById(orderId).select("orderNumber").lean<{ orderNumber?: string } | null>();
      return { status: "PAID", orderId, ...(order?.orderNumber ? { orderNumber: order.orderNumber } : {}) };
    }
    return { status: "PENDING" };
  }
  if (gaveUp) return { status: "CANCELLED", reason: "PAYER_CANCELLED" };
  // Nothing paid and the checkout closed (expired, or replaced by another): it can no longer be paid.
  const attempt = await CheckoutAttempt.findOne({ "gateway.extensionReference": checkoutRef }).select("status").lean<{ status?: string } | null>();
  if (!attempt || attempt.status === CHECKOUT_ATTEMPT_STATUS.EXPIRED || attempt.status === CHECKOUT_ATTEMPT_STATUS.SUPERSEDED) {
    return { status: "FAILED", reason: "EXPIRED" };
  }
  return { status: "PENDING" };
}
