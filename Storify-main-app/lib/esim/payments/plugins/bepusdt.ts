import { createHash, timingSafeEqual } from "node:crypto";
import { requestJson, type FetchLike } from "@/lib/esim/providers/http";
import { PaymentPluginError, type Credentials, type CryptoCapability, type CryptoInvoice, type PayNotice, type PayRequest, type PayStart, type PaymentPlugin } from "./types";

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

/** The order statuses of BEpusdt's own code (app/model/order.go). */
const ORDER_STATES: Record<number, CryptoInvoice["state"]> = { 1: "waiting", 2: "paid", 3: "expired", 4: "cancelled", 5: "confirming", 6: "failed" };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

/**
 * The cashier page's own calls (POST /api/v1/pay/info, /methods, /update-order):
 * keyed by the order's trade_id alone, not signed. Made from the server, the
 * shopper's app never sees the gateway.
 */
async function cashier(path: string, payload: Record<string, unknown>, credentials: Credentials, fetcher: FetchLike) {
  if (!credentials.apiUrl) throw new PaymentPluginError("BEpusdt is not configured");
  const { body } = await requestJson(fetcher, {
    method: "POST",
    url: `${credentials.apiUrl.replace(/\/+$/, "")}/api/v1/pay/${path}`,
    body: payload,
  });
  if (Number(body.status_code) !== 200) {
    throw new PaymentPluginError(typeof body.message === "string" && body.message ? `BEpusdt: ${body.message}` : "BEpusdt did not answer");
  }
  return (body.data ?? {}) as Record<string, unknown>;
}

/** "usdt.trc20" → USDT, TRC20; a network name of BEpusdt's own when it gave one. */
function tradeTypeParts(tradeType: string) {
  const [coin = "", net = ""] = tradeType.split(".");
  return { currency: coin.toUpperCase(), network: net };
}

/** What `update-order` and `info` answer, as an invoice; null when no coin is chosen yet. */
export function bepusdtInvoice(data: Record<string, unknown>, now = Date.now()): CryptoInvoice | null {
  const address = text(data.token);
  const amount = text(data.actual_amount);
  const tradeType = text(data.trade_type);
  if (!address || !amount || !tradeType) return null;
  const network = (data.network && typeof data.network === "object" ? data.network : {}) as Record<string, unknown>;
  const parts = tradeTypeParts(tradeType);
  const currency = text(network.crypto).toUpperCase() || parts.currency;
  const networkCode = text(network.network) || parts.network;
  // `info` gives a unix time, `update-order` the seconds left.
  const expiredAt = Number(data.expired_at);
  const left = Number(data.expiration_time);
  const expiresAt = Number.isFinite(expiredAt) && expiredAt > 0
    ? new Date(expiredAt * 1000).toISOString()
    : Number.isFinite(left) && left >= 0 && data.expiration_time !== undefined
      ? new Date(now + left * 1000).toISOString()
      : null;
  return {
    currency,
    network: networkCode,
    networkName: text(network.name) || text(network.alias) || parts.network.toUpperCase(),
    address,
    amount,
    expiresAt,
    state: ORDER_STATES[Number(data.status)] ?? "waiting",
  };
}

const bepusdtCrypto: CryptoCapability = {
  async options(id, credentials, fetcher) {
    const data = await cashier("methods", { trade_id: id }, credentials, fetcher);
    const methods = Array.isArray(data.methods) ? (data.methods as Record<string, unknown>[]) : [];
    return methods
      .map((method) => ({
        currency: text(method.currency).toUpperCase(),
        network: text(method.network),
        networkName: text(method.token_net_name) || text(method.network).toUpperCase(),
        amount: text(method.actual_amount),
      }))
      .filter((option) => option.currency && option.network && option.amount);
  },
  async choose(id, choice, credentials, fetcher) {
    const data = await cashier("update-order", { trade_id: id, currency: choice.currency, network: choice.network }, credentials, fetcher);
    const invoice = bepusdtInvoice(data);
    if (!invoice) throw new PaymentPluginError("BEpusdt did not give an address");
    // update-order names the coin by its trade type only: keep the choice's own words.
    const options = await bepusdtCrypto.options(id, credentials, fetcher).catch(() => []);
    const option = options.find((entry) => entry.currency === choice.currency.toUpperCase() && entry.network === choice.network);
    return { ...invoice, currency: choice.currency.toUpperCase(), network: choice.network, networkName: option?.networkName || invoice.networkName };
  },
  async current(id, credentials, fetcher) {
    return bepusdtInvoice(await cashier("info", { trade_id: id }, credentials, fetcher));
  },
};

export const bepusdtPlugin: PaymentPlugin = {
  code: "bepusdt",
  crypto: bepusdtCrypto,
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
