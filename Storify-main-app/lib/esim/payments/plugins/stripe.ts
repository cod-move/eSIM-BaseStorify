import { createHmac, timingSafeEqual } from "node:crypto";
import { requestJson, type FetchLike } from "@/lib/esim/providers/http";
import { IGNORED_NOTICE, PaymentPluginError, type Credentials, type NoticeContext, type PayNotice, type PayRequest, type PayStart, type PaymentPlugin, type SheetStart } from "./types";

/**
 * Stripe's hosted Checkout, for the ways to pay Storify's own card form does
 * not take: Alipay, WeChat Pay, Apple Pay, Google Pay, Link, Klarna and the
 * rest. Storify's card payments are left as they are; this is a payment
 * method of the eSIM module like any other (PAY, patch P15).
 *
 * A try is a Checkout Session of one line, the amount due. The shopper pays
 * on Stripe's page and comes back to the eSIM payment page, which waits for
 * the webhook: `checkout.session.completed` (paid at once, or `unpaid` while
 * a delayed method is confirmed), `checkout.session.async_payment_succeeded`
 * / `_failed`, and `checkout.session.expired`. Stripe signs the raw body
 * (`Stripe-Signature: t=…,v1=…`, an HMAC-SHA256 of "t.body" under the
 * endpoint's signing secret); a notice older than five minutes is refused.
 *
 * Credentials: secretKey and webhookSecret (secrets); optional methods, a
 * comma-separated list of Stripe payment method types ("alipay,wechat_pay").
 * Without it Stripe offers what is switched on in its Dashboard.
 * threeDSecure: `any` (the default: every card payment asks the bank for
 * 3D Secure), `challenge` (the bank must show a challenge) or `automatic`
 * (Stripe's own rules). adaptivePricing: `on` / `off` forces Adaptive
 * Pricing (the shopper sees and pays in their local currency; the session
 * stays in ours) for this payment; empty follows the Dashboard.
 */

const API = "https://api.stripe.com/v1";
/** Seconds either way a signature may be from the server's clock (Stripe's own default). */
const TOLERANCE_S = 300;
/** A session lasts an hour (Stripe allows 30 minutes to 24 hours): long enough to pay, short enough not to outlive the checkout. */
const SESSION_S = 3600;
/** Our try references (service.ts `newPaymentReference`): anything else on the account is not ours. */
const REFERENCE = /^EP[0-9A-F]{16,40}$/;
/** Stripe's own page in these languages; the browser's otherwise. */
const LOCALES = new Set(["de", "en", "es", "fr", "ja", "nl", "tr", "zh"]);
/** Two-decimal currencies only: the amount is sent in cents. */
const CURRENCIES = ["USD", "EUR", "GBP", "HKD", "CNY", "SGD", "AUD", "CAD", "NZD", "CHF"];

export function stripeSignatureHeader(raw: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function signatureValid(header: string, raw: string, secret: string, nowMs: number): boolean {
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((text) => text?.trim() ?? "");
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw}`, "utf8").digest("hex"));
  return signatures.some((signature) => {
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The payment method types an admin listed, cleaned; empty is "what the Dashboard has on". */
export function stripeMethodTypes(list: string | undefined): string[] {
  return [...new Set((list ?? "").split(/[\s,]+/).map((type) => type.trim().toLowerCase()).filter((type) => /^[a-z_]{2,40}$/.test(type)))];
}

/** The 3D Secure request for card payments; anything unknown is "any". */
export function stripeThreeDSecure(value: string | undefined): "any" | "challenge" | "automatic" {
  const choice = (value ?? "").trim().toLowerCase();
  return choice === "challenge" || choice === "automatic" ? choice : "any";
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

export const stripePlugin: PaymentPlugin = {
  code: "stripe",
  credentialKeys: ["secretKey", "webhookSecret", "publishableKey", "methods", "threeDSecure", "adaptivePricing"],
  secretKeys: ["secretKey", "webhookSecret"],
  currencies: CURRENCIES,
  acknowledge: { accepted: "ok", rejected: "rejected" },
  sheet: {
    ready: (credentials) => /^pk_(live|test)_\w+$/.test(credentials.publishableKey?.trim() ?? ""),
    start: startPaymentIntent,
  },

  async start(request: PayRequest, credentials: Credentials, fetcher: FetchLike): Promise<PayStart> {
    if (!credentials.secretKey) throw new PaymentPluginError("Stripe is not configured");
    const form: Record<string, string> = {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": request.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(request.amountMinor),
      "line_items[0][price_data][product_data][name]": request.subject,
      success_url: request.returnUrl,
      cancel_url: request.returnUrl,
      client_reference_id: request.reference,
      "metadata[reference]": request.reference,
      "payment_intent_data[metadata][reference]": request.reference,
      locale: stripeLocale(request.locale),
      expires_at: String(Math.floor(Date.now() / 1000) + SESSION_S),
    };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) form.customer_email = request.email;
    const types = stripeMethodTypes(credentials.methods);
    types.forEach((type, index) => {
      form[`payment_method_types[${index}]`] = type;
    });
    // Card payments ask for 3D Secure unless the admin chose otherwise.
    if (!types.length || types.includes("card")) form["payment_method_options[card][request_three_d_secure]"] = stripeThreeDSecure(credentials.threeDSecure);
    const adaptive = (credentials.adaptivePricing ?? "").trim().toLowerCase();
    if (adaptive === "on" || adaptive === "off") form["adaptive_pricing[enabled]"] = adaptive === "on" ? "true" : "false";
    // Stripe's page shows WeChat Pay's QR code only when told it is on the web.
    if (types.includes("wechat_pay")) form["payment_method_options[wechat_pay][client]"] = "web";

    const { ok, body } = await requestJson(fetcher, {
      method: "POST",
      url: `${API}/checkout/sessions`,
      headers: { Authorization: `Bearer ${credentials.secretKey}`, "Idempotency-Key": `esim-${request.reference}` },
      form,
    });
    const url = text(body.url);
    if (!ok || !url) {
      const message = text((body.error as { message?: unknown } | undefined)?.message);
      throw new PaymentPluginError(message ? `Stripe: ${message}` : "Stripe could not create the payment");
    }
    return { kind: "redirect", url, gatewayPaymentId: text(body.id) || undefined };
  },

  readNotice(body: Record<string, unknown>, credentials: Credentials, context?: NoticeContext): PayNotice | typeof IGNORED_NOTICE | null {
    if (!context) return null;
    const header = context.headers["stripe-signature"] ?? "";
    if (!credentials.webhookSecret || !header || !signatureValid(header, context.raw, credentials.webhookSecret, context.now)) return null;
    const type = text(body.type);
    const session = ((body.data as { object?: unknown } | undefined)?.object ?? {}) as Record<string, unknown>;
    if (type.startsWith("payment_intent.") && session.object === "payment_intent") return intentNotice(type, session);
    if (!type.startsWith("checkout.session.") || session.object !== "checkout.session") return IGNORED_NOTICE;
    const reference = text(session.client_reference_id) || text((session.metadata as { reference?: unknown } | undefined)?.reference);
    // A session of Storify's own card checkout, or anything else on the same account.
    if (!REFERENCE.test(reference)) return IGNORED_NOTICE;

    let state: PayNotice["state"];
    if (type === "checkout.session.completed") {
      if (session.payment_status === "paid") state = "paid";
      else if (session.payment_status === "unpaid") state = "pending";
      else return IGNORED_NOTICE;
    } else if (type === "checkout.session.async_payment_succeeded") state = "paid";
    else if (type === "checkout.session.async_payment_failed") state = "failed";
    else if (type === "checkout.session.expired") state = "expired";
    else return IGNORED_NOTICE;

    const amount = Number(session.amount_total);
    return {
      reference,
      state,
      gatewayPaymentId: text(session.payment_intent) || text(session.id) || undefined,
      amountMinor: Number.isInteger(amount) ? amount : null,
      currency: text(session.currency) ? text(session.currency).toUpperCase() : null,
    };
  },
};

/**
 * The shopper app's own sheet (Stripe's Payment Sheet): a PaymentIntent of the
 * amount due, marked as ours (`metadata.esim_sheet`), so its events are read
 * here and a Checkout Session's own PaymentIntent is not read twice. The
 * methods are the Dashboard's (`automatic_payment_methods`): the sheet shows
 * those it can, cards and Apple Pay / Google Pay among them.
 */
async function startPaymentIntent(request: PayRequest, credentials: Credentials, fetcher: FetchLike): Promise<SheetStart> {
  const publishableKey = credentials.publishableKey?.trim() ?? "";
  if (!credentials.secretKey || !publishableKey) throw new PaymentPluginError("Stripe is not configured for the app");
  const form: Record<string, string> = {
    amount: String(request.amountMinor),
    currency: request.currency.toLowerCase(),
    description: request.subject,
    "metadata[reference]": request.reference,
    "metadata[esim_sheet]": "1",
    "automatic_payment_methods[enabled]": "true",
    "payment_method_options[card][request_three_d_secure]": stripeThreeDSecure(credentials.threeDSecure),
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) form.receipt_email = request.email;
  const { ok, body } = await requestJson(fetcher, {
    method: "POST",
    url: `${API}/payment_intents`,
    headers: { Authorization: `Bearer ${credentials.secretKey}`, "Idempotency-Key": `esim-sheet-${request.reference}` },
    form,
  });
  const intentId = text(body.id);
  const clientSecret = text(body.client_secret);
  if (!ok || !intentId || !clientSecret) {
    const message = text((body.error as { message?: unknown } | undefined)?.message);
    throw new PaymentPluginError(message ? `Stripe: ${message}` : "Stripe could not create the payment");
  }
  return {
    intentId,
    clientSecret,
    publishableKey,
    testMode: publishableKey.startsWith("pk_test_"),
    ...(await accountCountry(credentials.secretKey, fetcher).then((country) => (country ? { merchantCountryCode: country } : {}))),
  };
}

/** The account's country, asked once per key: the sheet offers Apple Pay / Google Pay with it. */
const countries = new Map<string, string>();
async function accountCountry(secretKey: string, fetcher: FetchLike): Promise<string | null> {
  const known = countries.get(secretKey);
  if (known) return known;
  try {
    const { ok, body } = await requestJson(fetcher, { method: "GET", url: `${API}/account`, headers: { Authorization: `Bearer ${secretKey}` }, timeoutMs: 5000 });
    const country = text(body.country).toUpperCase();
    if (!ok || !/^[A-Z]{2}$/.test(country)) return null;
    countries.set(secretKey, country);
    return country;
  } catch {
    return null;
  }
}

/**
 * A PaymentIntent event of the app's sheet. A failed attempt is not the end:
 * the shopper may try another card in the same sheet, so only a cancelled
 * intent fails the try.
 */
function intentNotice(type: string, intent: Record<string, unknown>): PayNotice | typeof IGNORED_NOTICE {
  const metadata = (intent.metadata ?? {}) as Record<string, unknown>;
  const reference = text(metadata.reference);
  if (metadata.esim_sheet !== "1" || !REFERENCE.test(reference)) return IGNORED_NOTICE;
  let state: PayNotice["state"];
  if (type === "payment_intent.succeeded") state = "paid";
  else if (type === "payment_intent.processing") state = "pending";
  else if (type === "payment_intent.canceled") state = "failed";
  else return IGNORED_NOTICE;
  const amount = Number(state === "paid" ? intent.amount_received : intent.amount);
  return {
    reference,
    state,
    gatewayPaymentId: text(intent.id) || undefined,
    amountMinor: Number.isInteger(amount) ? amount : null,
    currency: text(intent.currency) ? text(intent.currency).toUpperCase() : null,
  };
}

/** Stripe's page language for ours: Traditional Chinese is Stripe's "zh-HK"; otherwise the two-letter ones it has, else the browser's. */
export function stripeLocale(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower === "zh-hant" || lower === "zh-tw" || lower === "zh-hk") return "zh-HK";
  const short = lower.slice(0, 2);
  return LOCALES.has(short) ? short : "auto";
}
