import "server-only";

import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { ValidationError } from "@/lib/api/errors";
import { CheckoutAttempt, CHECKOUT_ATTEMPT_STATUS, Order, User } from "@/models";
import { getSettings } from "@/models/settings.model";
import { EsimPayment, EsimPaymentMethod, type EsimPaymentOutcome, type IEsimPayment, type IEsimPaymentMethod } from "@/models/esim-payment.model";
import { decryptCredential } from "@/lib/esim/secrets";
import { amountDueNow, type SettingsDocument } from "@/lib/payments/finalize-order";
import { CHECKOUT_CLOSED_BEFORE_PAYMENT, finalizeCapturedAttempt, findAttemptByGatewayRef } from "@/lib/payments/finalize-attempt";
import { closeCheckoutAttempt } from "@/lib/checkout/checkout-attempt-store";
import { paymentMethodDefinition, PAYMENT_METHOD_DEFINITIONS, type PaymentMethodDefinition } from "./registry";
import { PaymentPluginError, type Credentials, type PayRequest } from "./plugins/types";

/**
 * Extension payments (PAY, patch P15): the payment page's methods, starting a
 * try with a plugin, the gateway's notification, and settling a paid try
 * through Storify's own `finalizeCapturedAttempt` — which writes the order,
 * takes the stock, books the money and sends the emails exactly as it does
 * for Pesapal. Refunds of this method are recorded as made by hand: Storify
 * treats any method outside its GATEWAY_REFUND_METHODS that way.
 */

export const EXTENSION_METHOD = "extension";
/** Matched exactly by the checkout attempt's unique `gateway.extensionReference`. */
export const CHECKOUT_REF = /^ext[0-9a-f]{24}$/;

const toMinor = (amount: number) => Math.round(amount * 100);
const newPaymentReference = () => `EP${randomBytes(11).toString("hex")}`.toUpperCase();
export const newCheckoutReference = () => `ext${randomBytes(12).toString("hex")}`;

/** Defaults, then plain values, then decrypted secrets. Needs `+secretCredentials`. */
export function methodCredentials(definition: PaymentMethodDefinition, method: IEsimPaymentMethod | null): Credentials {
  const credentials: Credentials = { ...definition.defaults };
  for (const [key, value] of method?.credentials ?? []) if (value) credentials[key] = value;
  for (const [key, secret] of method?.secretCredentials ?? []) credentials[key] = decryptCredential(secret);
  return credentials;
}

/** Every key the plugin needs before it can take a payment (optional ones aside). */
const REQUIRED: Record<string, readonly string[]> = {
  bepusdt: ["apiUrl", "apiToken"],
  redeepay: ["apiBaseUrl", "merchantNo", "tradeKey", "domain", "pcRoute", "h5Route"],
  fake: ["secret"],
};

export function missingCredentials(definition: PaymentMethodDefinition, credentials: Credentials): string[] {
  return (REQUIRED[definition.plugin.code] ?? []).filter((key) => !credentials[key]?.trim());
}

export interface OfferedMethod {
  code: string;
  name: string;
}

/** The methods a shopper can pay with now, in order: switched on, set up, settling USD. */
export async function offeredMethods(currency = "USD"): Promise<OfferedMethod[]> {
  await connectDB();
  const rows = await EsimPaymentMethod.find({ status: "active" }).select("+secretCredentials").sort({ sort: 1, code: 1 });
  const offered: OfferedMethod[] = [];
  for (const row of rows) {
    const definition = paymentMethodDefinition(row.code);
    if (!definition || !definition.plugin.currencies.includes(currency)) continue;
    let credentials: Credentials;
    try {
      credentials = methodCredentials(definition, row);
    } catch {
      continue;
    }
    if (missingCredentials(definition, credentials).length) continue;
    offered.push({ code: row.code, name: row.name || definition.displayName });
  }
  return offered;
}

/**
 * For Storify's public settings (P15): the names of the methods on offer —
 * none means checkout does not show "extension" at all. Never throws.
 */
export async function extensionMethodNames(currency?: string | null): Promise<string[]> {
  try {
    return (await offeredMethods(String(currency || "USD").toUpperCase())).map((method) => method.name);
  } catch (error) {
    console.error("Reading the extension payment methods failed:", error);
    return [];
  }
}

export async function extensionCheckoutAvailable(currency?: string | null): Promise<boolean> {
  return (await extensionMethodNames(currency)).length > 0;
}

type AttemptView = {
  _id: unknown;
  status: string;
  expiresAt?: Date;
  snapshot?: {
    total?: number;
    preorderOutstandingAmount?: number;
    storeCredit?: never;
    currency?: string;
    customerId?: unknown;
    guestEmail?: string;
    billingAddress?: Record<string, string | undefined>;
  };
  finalize?: { orderId?: unknown; orderNumber?: string } | null;
  customerId?: unknown;
  guestEmail?: string;
};

async function attemptFor(checkoutRef: string) {
  if (!CHECKOUT_REF.test(checkoutRef)) return null;
  return CheckoutAttempt.findOne({ "gateway.extensionReference": checkoutRef, paymentMethod: EXTENSION_METHOD })
    .select("_id status expiresAt snapshot finalize customerId guestEmail")
    .lean<AttemptView | null>();
}

const attemptOpen = (attempt: AttemptView, now = new Date()) =>
  attempt.status === CHECKOUT_ATTEMPT_STATUS.OPEN && (!attempt.expiresAt || new Date(attempt.expiresAt) > now);

export interface ShopperPay {
  kind: "redirect" | "qr";
  data: string;
  /** For QR data: the code as an image (a data URL). */
  image?: string;
}

async function forShopper(pay: { kind: "redirect" | "qr"; data: string }): Promise<ShopperPay> {
  if (pay.kind !== "qr") return { kind: pay.kind, data: pay.data };
  const QRCode = (await import("qrcode")).default;
  return { kind: "qr", data: pay.data, image: await QRCode.toDataURL(pay.data, { width: 280, margin: 2, errorCorrectionLevel: "M" }) };
}

export interface PaymentPageView {
  checkoutRef: string;
  amountMinor: number;
  currency: string;
  /** open: can be paid; paid: an order exists; closed: expired or replaced. */
  state: "open" | "paid" | "closed";
  orderNumber: string | null;
  methods: OfferedMethod[];
  /** The latest try, when it can still be paid or has been. */
  latest: { reference: string; method: string; state: string; pay: ShopperPay | null } | null;
}

/** What the eSIM payment page shows. The reference itself is the shopper's key to it. */
export async function paymentPage(checkoutRef: string): Promise<PaymentPageView | null> {
  await connectDB();
  const attempt = await attemptFor(checkoutRef);
  if (!attempt) return null;
  const currency = String(attempt.snapshot?.currency || "USD").toUpperCase();
  const [methods, latest] = await Promise.all([
    offeredMethods(currency),
    EsimPayment.findOne({ checkoutRef }).sort({ createdAt: -1 }).lean<IEsimPayment | null>(),
  ]);
  const settledOrder = attempt.finalize?.orderNumber || (latest?.settlement?.outcome === "order" ? latest.settlement.orderNumber : "") || null;
  return {
    checkoutRef,
    amountMinor: toMinor(amountDueNow(attempt.snapshot ?? {})),
    currency,
    state: settledOrder ? "paid" : attemptOpen(attempt) ? "open" : "closed",
    orderNumber: settledOrder,
    methods,
    latest: latest
      ? { reference: latest.reference, method: latest.method, state: latest.state, pay: latest.state === "pending" && latest.pay ? await forShopper(latest.pay) : null }
      : null,
  };
}

export interface StartContext {
  origin: string;
  clientIp: string;
  userAgent: string;
  locale: string;
  /** Opened by the shopper app: the gateway sends the payer back to the page in app mode. */
  app?: boolean;
}

/** A try with one method: the plugin is asked for a page or QR data. */
export async function startPayment(checkoutRef: string, methodCode: string, context: StartContext) {
  await connectDB();
  const attempt = await attemptFor(checkoutRef);
  if (!attempt) throw new ValidationError("This payment was not found");
  if (attempt.finalize?.orderId) throw new ValidationError("This order is already paid");
  if (!attemptOpen(attempt)) throw new ValidationError("This checkout has closed. Please check out again.");

  const definition = paymentMethodDefinition(methodCode);
  const method = definition ? await EsimPaymentMethod.findOne({ code: methodCode, status: "active" }).select("+secretCredentials") : null;
  if (!definition || !method) throw new ValidationError("This payment method is not available");
  const currency = String(attempt.snapshot?.currency || "USD").toUpperCase();
  const credentials = methodCredentials(definition, method);
  if (missingCredentials(definition, credentials).length || !definition.plugin.currencies.includes(currency)) {
    throw new ValidationError("This payment method is not available");
  }
  const amountMinor = toMinor(amountDueNow(attempt.snapshot ?? {}));
  if (amountMinor <= 0) throw new ValidationError("Nothing is due on this order");

  const billing = attempt.snapshot?.billingAddress ?? {};
  const customerId = attempt.customerId || attempt.snapshot?.customerId;
  const email = String(
    attempt.guestEmail ||
      attempt.snapshot?.guestEmail ||
      billing.email ||
      (customerId ? (await User.findById(customerId).select("email").lean<{ email?: string } | null>())?.email : "") ||
      "",
  );
  const payment = await EsimPayment.create({
    reference: newPaymentReference(),
    checkoutRef,
    attemptId: attempt._id as Types.ObjectId,
    method: methodCode,
    amountMinor,
    currency,
    customerId: (customerId as Types.ObjectId | undefined) || undefined,
    email: email || undefined,
  });

  const origin = context.origin.replace(/\/+$/, "");
  const request: PayRequest = {
    reference: payment.reference,
    amountMinor,
    currency,
    subject: "eSIM Order",
    returnUrl: `${origin}/esim/pay/${checkoutRef}?payment=${payment.reference}${context.app ? "&app=1" : ""}`,
    notifyUrl: `${origin}/api/esim/pay/notify/${methodCode}`,
    email,
    name: String(billing.fullName || [billing.firstName, billing.lastName].filter(Boolean).join(" ") || ""),
    country: String(billing.country || ""),
    clientIp: context.clientIp,
    userAgent: context.userAgent,
    locale: context.locale,
    payerId: customerId ? String(customerId) : "",
    billing: {
      firstName: String(billing.firstName || ""),
      lastName: String(billing.lastName || ""),
      phone: String(billing.phone || ""),
      state: String(billing.state || ""),
      city: String(billing.city || ""),
      street: String(billing.street || ""),
      postalCode: String(billing.postalCode || ""),
    },
  };

  try {
    const started = await definition.plugin.start(request, credentials, fetch);
    const pay = started.kind === "redirect" ? { kind: "redirect" as const, data: started.url } : { kind: "qr" as const, data: started.data };
    await EsimPayment.updateOne(
      { _id: payment._id, state: "started" },
      { $set: { state: "pending", pay, ...(started.gatewayPaymentId ? { gatewayPaymentId: started.gatewayPaymentId } : {}) } },
    );
    return { reference: payment.reference, pay: await forShopper(pay) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A gateway that did not answer may still have made the payment; the row
    // stays "started" so a late notification can find it.
    await EsimPayment.updateOne({ _id: payment._id }, { $set: { error: message.slice(0, 500), ...(error instanceof PaymentPluginError ? { state: "failed" } : {}) } });
    console.error(`Starting a ${methodCode} payment failed:`, message);
    throw new ValidationError("The payment could not be started. Please try again or choose another method.");
  }
}

export interface NoticeAnswer {
  accepted: boolean;
  /** The plain text the gateway expects back. */
  text: string;
}

/**
 * A gateway's notification. Answered "accepted" once a paid payment is
 * recorded, even if settling it fails — the sweep settles it again, and a
 * gateway retrying forever would not help.
 */
export async function receiveNotice(methodCode: string, body: Record<string, unknown>): Promise<NoticeAnswer> {
  const definition = paymentMethodDefinition(methodCode);
  if (!definition) return { accepted: false, text: "unknown method" };
  const { accepted, rejected } = definition.plugin.acknowledge;
  await connectDB();
  // A method switched off since still settles what was paid with it.
  const method = await EsimPaymentMethod.findOne({ code: methodCode }).select("+secretCredentials");
  const notice = definition.plugin.readNotice(body, methodCredentials(definition, method));
  if (!notice) return { accepted: false, text: rejected };
  const payment = await EsimPayment.findOneAndUpdate({ reference: notice.reference, method: methodCode }, { $inc: { notices: 1 } }, { returnDocument: "after" });
  if (!payment) return { accepted: false, text: rejected };

  if (notice.state !== "paid") {
    if (payment.state === "started" || payment.state === "pending") {
      await EsimPayment.updateOne({ _id: payment._id, state: { $in: ["started", "pending"] } }, { $set: { state: notice.state } });
    }
    return { accepted: true, text: accepted };
  }

  const amountWrong = notice.amountMinor !== null && notice.amountMinor !== payment.amountMinor;
  const currencyWrong = notice.currency !== null && notice.currency.toUpperCase() !== payment.currency;
  if (amountWrong || currencyWrong) {
    const message = `Paid ${notice.amountMinor ?? "?"} ${notice.currency ?? payment.currency} (minor units) for ${payment.amountMinor} ${payment.currency}`;
    if (payment.error !== message) {
      await EsimPayment.updateOne({ _id: payment._id }, { $set: { error: message } });
      await anomaly(`${methodName(methodCode)} payment for the wrong amount`, `Payment ${payment.reference}: ${message}. It was not accepted; check the gateway and settle or refund it by hand.`);
    }
    return { accepted: false, text: rejected };
  }

  await EsimPayment.updateOne(
    { _id: payment._id, state: { $ne: "paid" } },
    { $set: { state: "paid", paidAt: new Date(), ...(notice.gatewayPaymentId ? { gatewayPaymentId: notice.gatewayPaymentId } : {}) } },
  );
  await settlePayment(String(payment._id)).catch((error) => console.error(`Settling payment ${payment.reference} failed:`, error));
  return { accepted: true, text: accepted };
}

function methodName(code: string) {
  return paymentMethodDefinition(code)?.displayName ?? code;
}

async function anomaly(title: string, message: string) {
  const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");
  await notifyAdminsPaymentAnomaly({ title, message }).catch((error) => console.error("Failed to send payment anomaly alert:", error));
}

/**
 * A paid try becomes the order, through Storify's settlement. Idempotent:
 * a settled payment is left as it is, and a second paid try on the same
 * checkout is recorded as a duplicate to send back.
 */
export async function settlePayment(paymentId: string): Promise<EsimPaymentOutcome | null> {
  await connectDB();
  const payment = await EsimPayment.findById(paymentId);
  if (!payment || payment.state !== "paid") return null;
  if (payment.settlement) return payment.settlement.outcome;
  const settings = (await getSettings()) as SettingsDocument;
  const label = methodName(payment.method);

  let outcome: EsimPaymentOutcome;
  let order: { orderId?: unknown; orderNumber?: string } = {};
  try {
    const result = await finalizeCapturedAttempt({
      findAttempt: (scope) => findAttemptByGatewayRef("extensionReference", payment.checkoutRef, scope),
      orderPrefix: settings.orders?.prefix,
      provider: { paymentMethod: EXTENSION_METHOD, label, recoveryGateway: EXTENSION_METHOD },
      // Extension checkouts only ever write attempts.
      findOrder: async () => null,
      notFoundMessage: "No checkout was found for this payment",
      verify: (pending) => {
        const due = toMinor(amountDueNow(pending));
        if (due !== payment.amountMinor) throw new ValidationError(`${label} amount mismatch`);
        if (String(pending.currency || "USD").toUpperCase() !== payment.currency) throw new ValidationError(`${label} currency mismatch`);
        return {
          paymentId: payment.reference,
          auditTransactionId: payment.gatewayPaymentId ?? null,
          customerEmail: payment.email || undefined,
        };
      },
      settings,
      customerEmail: payment.email || undefined,
    });
    order = { orderId: result.orderId, orderNumber: result.orderNumber };
    const paidBy = result.alreadyPaid ? (await Order.findById(result.orderId).select("paymentId").lean<{ paymentId?: string } | null>())?.paymentId : payment.reference;
    outcome = paidBy === payment.reference ? "order" : "duplicate";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== CHECKOUT_CLOSED_BEFORE_PAYMENT) {
      await EsimPayment.updateOne({ _id: payment._id }, { $set: { error: message.slice(0, 500) } });
      throw error;
    }
    // Storify wrote a cancelled order for it and recorded the refund (by hand).
    outcome = "closed";
    const cancelled = await Order.findOne({ checkoutAttemptId: payment.attemptId }).select("_id orderNumber").lean<{ _id: unknown; orderNumber?: string } | null>();
    order = cancelled ? { orderId: cancelled._id, orderNumber: cancelled.orderNumber } : {};
  }

  await EsimPayment.updateOne(
    { _id: payment._id, settlement: { $exists: false } },
    { $set: { settlement: { outcome, orderId: order.orderId, orderNumber: order.orderNumber, at: new Date() } }, $unset: { error: "" } },
  );
  if (outcome === "duplicate") {
    await anomaly(
      `${label} paid twice for one checkout`,
      `Payment ${payment.reference} (${(payment.amountMinor / 100).toFixed(2)} ${payment.currency}) arrived after order ${order.orderNumber ?? ""} was already paid by another payment. Send it back to the shopper through ${label}, then mark it refunded under eSIM → Payments.`,
    );
  }
  return outcome;
}

/**
 * The safety net, run with the fulfilment cron: paid tries whose settlement
 * failed are settled again, and extension checkouts past their window with
 * nothing paid are closed (Storify's own sweep has no probe for this method).
 */
export async function sweepPayments(now = new Date()) {
  await connectDB();
  const unsettled = await EsimPayment.find({ state: "paid", settlement: { $exists: false } }).select("_id").sort({ paidAt: 1 }).limit(50).lean();
  let settled = 0;
  let failed = 0;
  for (const row of unsettled) {
    try {
      if (await settlePayment(String(row._id))) settled++;
    } catch {
      failed++;
    }
  }

  const stale = await CheckoutAttempt.find({ paymentMethod: EXTENSION_METHOD, status: CHECKOUT_ATTEMPT_STATUS.OPEN, expiresAt: { $lt: now } })
    .select("_id gateway")
    .limit(100)
    .lean<Array<{ _id: unknown; gateway?: { extensionReference?: string } }>>();
  let expired = 0;
  for (const attempt of stale) {
    const ref = attempt.gateway?.extensionReference;
    // Money recorded and not yet settled: leave it for the settlement above.
    if (ref && (await EsimPayment.exists({ checkoutRef: ref, state: "paid" }))) continue;
    if (await closeCheckoutAttempt(attempt._id, CHECKOUT_ATTEMPT_STATUS.EXPIRED)) expired++;
  }
  return { settled, failed, expired };
}

/** For the admin list: every known method, configured or not. */
export function definedMethodCodes(): string[] {
  return Object.keys(PAYMENT_METHOD_DEFINITIONS).filter((code) => paymentMethodDefinition(code) && !paymentMethodDefinition(code)!.devOnly);
}
