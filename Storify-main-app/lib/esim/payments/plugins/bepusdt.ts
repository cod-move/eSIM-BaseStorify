import { createHash, timingSafeEqual } from "node:crypto";
import { requestJson, type FetchLike } from "@/lib/esim/providers/http";
import { PaymentPluginError, type Credentials, type PayNotice, type PayRequest, type PayStart, type PaymentPlugin } from "./types";

/**
 * BEpusdt (crypto: USDT, USDC), as the old store called it
 * (`Gateway/BEpusdt/ProcessController.php`): POST /api/v1/order/create-order
 * with an MD5 signature over the sorted, non-empty fields, then a signed
 * notification whose `status` is 1 waiting, 2 paid, 3 expired.
 *
 * Credentials: apiUrl, apiToken (secret); optional cryptos ("USDT,USDC"),
 * orderName and timeout (seconds).
 */

/** PHP's `(string)` on a decoded JSON value, which is what the gateway signs. */
function phpString(value: unknown): string {
  if (value === true) return "1";
  if (value === false) return "";
  return String(value);
}

export function bepusdtSignature(params: Record<string, unknown>, token: string): string {
  const plain = Object.keys(params)
    .filter((key) => key !== "signature" && params[key] !== null && params[key] !== undefined && params[key] !== "" && typeof params[key] !== "object")
    .sort()
    .map((key) => `${key}=${phpString(params[key])}`)
    .join("&");
  return createHash("md5").update(plain + token, "utf8").digest("hex");
}

function sameText(a: string, b: string) {
  const left = Buffer.from(a.toLowerCase());
  const right = Buffer.from(b.toLowerCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

const STATES: Record<number, PayNotice["state"]> = { 1: "pending", 2: "paid", 3: "expired" };

export const bepusdtPlugin: PaymentPlugin = {
  code: "bepusdt",
  credentialKeys: ["apiUrl", "apiToken", "cryptos", "orderName", "timeout"],
  secretKeys: ["apiToken"],
  currencies: ["USD", "EUR", "CNY", "GBP", "JPY"],
  acknowledge: { accepted: "success", rejected: "failed" },

  async start(request: PayRequest, credentials: Credentials, fetcher: FetchLike): Promise<PayStart> {
    if (!credentials.apiUrl || !credentials.apiToken) throw new PaymentPluginError("BEpusdt is not configured");
    const payload: Record<string, unknown> = {
      order_id: request.reference,
      amount: request.amountMinor / 100,
      notify_url: request.notifyUrl,
      redirect_url: request.returnUrl,
      fiat: request.currency.toUpperCase(),
    };
    if (credentials.cryptos?.trim()) payload.currencies = credentials.cryptos.trim();
    if (credentials.orderName?.trim()) payload.name = credentials.orderName.trim();
    const timeout = Number(credentials.timeout);
    if (Number.isInteger(timeout) && timeout > 0) payload.timeout = timeout;
    payload.signature = bepusdtSignature(payload, credentials.apiToken);

    const { body } = await requestJson(fetcher, {
      method: "POST",
      url: `${credentials.apiUrl.replace(/\/+$/, "")}/api/v1/order/create-order`,
      body: payload,
    });
    const data = (body.data ?? {}) as Record<string, unknown>;
    if (Number(body.status_code) !== 200 || typeof data.payment_url !== "string" || !data.payment_url) {
      throw new PaymentPluginError(typeof body.message === "string" && body.message ? `BEpusdt: ${body.message}` : "BEpusdt could not create the payment");
    }
    return { kind: "redirect", url: data.payment_url, gatewayPaymentId: typeof data.trade_id === "string" ? data.trade_id : undefined };
  },

  readNotice(body: Record<string, unknown>, credentials: Credentials): PayNotice | null {
    if (!credentials.apiToken) return null;
    const reference = typeof body.order_id === "string" ? body.order_id : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (!reference || !signature || !sameText(signature, bepusdtSignature(body, credentials.apiToken))) return null;
    const amount = Number(body.amount);
    return {
      reference,
      state: STATES[Number(body.status)] ?? "pending",
      gatewayPaymentId: typeof body.trade_id === "string" ? body.trade_id : undefined,
      amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null,
      currency: null,
    };
  },
};
