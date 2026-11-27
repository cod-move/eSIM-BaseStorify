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
import { extensionMethodOptions, settlePayment } from "./service";
import { publicCheckoutDisplay } from "@/lib/esim/admin/checkout-display";
import { appDisplayRank, displayRank, shownOn } from "./checkout-display";
import { appBalanceMethod } from "./app-balance";

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
  options: {
    appScheme: string;
    currency: string;
    hasPreorder: boolean;
    /** The priced cart and its shopper: the account balance's row (patch P27). */
    balance?: { priced: Parameters<typeof appBalanceMethod>[0]; customerId: string | null; locale: string };
  },
): Promise<CheckoutQuote> {
  const display = await publicCheckoutDisplay();
  // The balance comes first, as on the website, when the admin shows it in the app.
  const balanceRow =
    options.balance && !options.hasPreorder && shownOn(display, "app", "store_credit")
      ? await appBalanceMethod(options.balance.priced, { customerId: options.balance.customerId, currency: options.currency, locale: options.balance.locale })
      : null;
  quote = balanceRow ? { ...quote, paymentMethods: [balanceRow, ...quote.paymentMethods] } : quote;
  const ordered = (methods: CheckoutQuote["paymentMethods"]) =>
    methods
      .map((method, index) => ({ method, index, rank: appDisplayRank(display, method.id) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.method);
  // A method the store has not switched on (or set up) is not offered at all, rather than shown greyed;
  // nor one the admin shows on the website only.
  const own = quote.paymentMethods.filter((method) => !isSwitchedOff(method) && shownOn(display, "app", method.id));
  if (options.hasPreorder) return { ...quote, paymentMethods: ordered(own) };
  const offered = (await extensionMethodOptions(options.currency)).filter((method) => shownOn(display, "app", `extension:${method.code}`));
  if (!offered.length || !isValidAppScheme(options.appScheme)) return { ...quote, paymentMethods: ordered(own) };
  // One row per eSIM method, in the order set for checkout (older apps show the joined name).
  const rows = offered
    .map((method, index) => ({ method, index, rank: displayRank(display, `extension:${method.code}`) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ method }) => {
      const icon = display.icons[`extension:${method.code}`];
      return {
        code: method.code,
        name: method.name,
        native: Boolean(method.inApp),
        ...(method.inApp ? { nativeKind: method.inApp } : {}),
        ...(icon ? { icon: icon.startsWith("/") ? `${appBaseUrl()}${icon}` : icon } : {}),
      };
    });
  return {
    ...quote,
    paymentMethods: ordered([
      ...own,
      { id: "extension", flow: "redirect", name: rows.map((row) => row.name).join(" · "), available: true, options: rows },
    ]),
  };
}

/** Switched off in the store's settings, or not set up: not for shoppers to see. */
export function isSwitchedOff(method: CheckoutQuote["paymentMethods"][number]): boolean {
  return !method.available && (method.reason === "DISABLED" || method.reason === "NOT_CONFIGURED");
}

/** The redirect start: an attempt and the eSIM payment page, in app mode, in the shopper's language. */
export async function startExtensionRedirect(
  draft: CheckoutDraft,
  ctx: { locale: string; request: GatewayStartRequest; extensionMethod?: string },
): Promise<{ record: GatewayCheckoutRecord; gatewayUrl: string; resumed: boolean }> {
  const { storeDefault } = await getLocaleRouting();
  // The method chosen in the app's list holds the checkout to it (its fee is in the order), without
  // starting it: the app pays it in its own screen or sheet, or opens the page, which starts it.
  const start = await startExtensionCheckout(draft, {
    pageUrl: (reference) => `${appBaseUrl()}${buildLocalePath(ctx.locale, `/esim/pay/${reference}`, storeDefault)}?app=1`,
    request: ctx.request,
    ...(ctx.extensionMethod ? { method: ctx.extensionMethod } : {}),
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
