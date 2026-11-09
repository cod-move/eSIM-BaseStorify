import { createHmac, timingSafeEqual } from "node:crypto";
import { requestJson, type FetchLike } from "@/lib/esim/providers/http";
import { IGNORED_NOTICE, PaymentPluginError, type Credentials, type NoticeContext, type PayNotice, type PayRequest, type PayStart, type PaymentPlugin } from "./types";

/**
 * Airwallex's Hosted Payment Page (cards, Apple Pay, Google Pay, Alipay,
 * WeChat Pay and the local methods switched on in the account).
 *
 * A try is a PaymentIntent: POST /api/v1/authentication/login (x-client-id,
 * x-api-key) gives a bearer token, then /api/v1/pa/payment_intents/create
 * with our reference as merchant_order_id. Airwallex amounts are decimals in
 * the major unit ("10.50"). The hosted page is opened by Airwallex's own
 * script, so the shopper goes to our small launch page first
 * (app/api/esim/pay/airwallex/route.ts), which calls redirectToCheckout with
 * the intent's id and client secret and comes back to the eSIM payment page.
 *
 * Webhooks: `x-timestamp` (milliseconds) and `x-signature`, the hex
 * HMAC-SHA256 of timestamp + raw body under the notification URL's secret.
 * payment_intent.succeeded settles; payment_intent.cancelled fails the try.
 *
 * Credentials: clientId, apiKey and webhookSecret (secrets); env `prod` (the
 * default) or `demo` for the sandbox; optional methods, a comma-separated
 * list of Airwallex method types ("card,alipaycn,wechatpay") the page offers.
 */

const HOSTS = { prod: "https://api.airwallex.com", demo: "https://api.sandbox.airwallex.com" } as const;
const TOLERANCE_MS = 5 * 60_000;
/** Our try references (service.ts `newPaymentReference`). */
const REFERENCE = /^EP[0-9A-F]{16,40}$/;
const CURRENCIES = ["USD", "EUR", "GBP", "HKD", "CNY", "SGD", "AUD", "CAD", "NZD", "CHF"];
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function airwallexEnv(value: string | undefined): "prod" | "demo" {
  return (value ?? "").trim().toLowerCase() === "demo" ? "demo" : "prod";
}

/** Cents as Airwallex's decimal ("1050" → "10.50"), without floats. */
export function airwallexAmount(minor: number): string {
  if (!Number.isInteger(minor) || minor < 0) throw new PaymentPluginError("Invalid amount");
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/** Airwallex's decimal back to cents; null when it is not a plain two-place amount. */
export function airwallexMinor(value: unknown): number | null {
  const plain = typeof value === "number" ? value.toFixed(2) : text(value).trim();
  if (!DECIMAL.test(plain)) return null;
  const [whole, fraction = ""] = plain.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

export function airwallexMethodTypes(list: string | undefined): string[] {
  return [...new Set((list ?? "").split(/[\s,]+/).map((type) => type.trim().toLowerCase()).filter((type) => /^[a-z_]{2,40}$/.test(type)))];
}

export function airwallexSignature(timestamp: string, raw: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}${raw}`, "utf8").digest("hex");
}

/** Bearer tokens last 30 minutes; one is reused until shortly before then. */
const tokens = new Map<string, { token: string; until: number }>();

async function bearer(credentials: Credentials, fetcher: FetchLike, base: string): Promise<string> {
  const key = `${base}|${credentials.clientId}`;
  const cached = tokens.get(key);
  if (cached && cached.until > Date.now()) return cached.token;
  const { ok, body } = await requestJson(fetcher, {
    method: "POST",
    url: `${base}/api/v1/authentication/login`,
    headers: { "x-client-id": credentials.clientId.trim(), "x-api-key": credentials.apiKey.trim() },
    body: {},
  });
  const token = text(body.token);
  if (!ok || !token) throw new PaymentPluginError("Airwallex refused the client ID or API key");
  const expires = Date.parse(text(body.expires_at));
  tokens.set(key, { token, until: (Number.isFinite(expires) ? expires : Date.now() + 30 * 60_000) - 2 * 60_000 });
  return token;
}

/** For tests: forget cached tokens. */
export function forgetAirwallexTokens() {
  tokens.clear();
}

/** Airwallex's page language for ours. */
export function airwallexLocale(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower === "zh-hant" || lower === "zh-tw" || lower === "zh-hk") return "zh-HK";
  const short = lower.slice(0, 2);
  return ["de", "en", "es", "fr", "it", "ja", "ko", "nl", "pt", "ru", "zh"].includes(short) ? short : "en";
}

export const airwallexPlugin: PaymentPlugin = {
  code: "airwallex",
  credentialKeys: ["clientId", "apiKey", "webhookSecret", "env", "methods"],
  secretKeys: ["apiKey", "webhookSecret"],
  currencies: CURRENCIES,
  acknowledge: { accepted: "ok", rejected: "rejected" },

  async start(request: PayRequest, credentials: Credentials, fetcher: FetchLike): Promise<PayStart> {
    if (!credentials.clientId || !credentials.apiKey) throw new PaymentPluginError("Airwallex is not configured");
    const env = airwallexEnv(credentials.env);
    const base = HOSTS[env];
    const token = await bearer(credentials, fetcher, base);
    const payload: Record<string, unknown> = {
      request_id: request.reference,
      amount: airwallexAmount(request.amountMinor),
      currency: request.currency.toUpperCase(),
      merchant_order_id: request.reference,
      return_url: request.returnUrl,
      descriptor: request.subject.slice(0, 32),
      metadata: { reference: request.reference },
      order: { type: "digital_goods", products: [{ name: request.subject.slice(0, 120), quantity: 1, unit_price: airwallexAmount(request.amountMinor), type: "digital" }] },
    };
    const { ok, status, body } = await requestJson(fetcher, {
      method: "POST",
      url: `${base}/api/v1/pa/payment_intents/create`,
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    });
    if (status === 401) tokens.delete(`${base}|${credentials.clientId}`);
    const id = text(body.id);
    const secret = text(body.client_secret);
    if (!ok || !id || !secret) {
      const message = text(body.message);
      throw new PaymentPluginError(message ? `Airwallex: ${message}` : "Airwallex could not create the payment");
    }
    const launch = new URL("/api/esim/pay/airwallex", request.returnUrl);
    launch.searchParams.set("intent", id);
    launch.searchParams.set("secret", secret);
    launch.searchParams.set("currency", request.currency.toUpperCase());
    launch.searchParams.set("env", env);
    launch.searchParams.set("locale", airwallexLocale(request.locale));
    launch.searchParams.set("back", request.returnUrl);
    const methods = airwallexMethodTypes(credentials.methods);
    if (methods.length) launch.searchParams.set("methods", methods.join(","));
    return { kind: "redirect", url: launch.toString(), gatewayPaymentId: id };
  },

  readNotice(body: Record<string, unknown>, credentials: Credentials, context?: NoticeContext): PayNotice | typeof IGNORED_NOTICE | null {
    if (!context || !credentials.webhookSecret) return null;
    const timestamp = context.headers["x-timestamp"] ?? "";
    const given = Buffer.from((context.headers["x-signature"] ?? "").toLowerCase());
    const expected = Buffer.from(airwallexSignature(timestamp, context.raw, credentials.webhookSecret));
    if (!timestamp || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    if (!(Math.abs(context.now - Number(timestamp)) <= TOLERANCE_MS)) return null;

    const name = text(body.name);
    const intent = ((body.data as { object?: unknown } | undefined)?.object ?? {}) as Record<string, unknown>;
    if (!name.startsWith("payment_intent.")) return IGNORED_NOTICE;
    const reference = text(intent.merchant_order_id) || text((intent.metadata as { reference?: unknown } | undefined)?.reference);
    if (!REFERENCE.test(reference)) return IGNORED_NOTICE;

    let state: PayNotice["state"];
    if (name === "payment_intent.succeeded" && intent.status === "SUCCEEDED") state = "paid";
    else if (name === "payment_intent.cancelled") state = "failed";
    else return IGNORED_NOTICE;

    return {
      reference,
      state,
      gatewayPaymentId: text(intent.id) || undefined,
      amountMinor: airwallexMinor(intent.captured_amount ?? intent.amount),
      currency: text(intent.currency) ? text(intent.currency).toUpperCase() : null,
    };
  },
};
