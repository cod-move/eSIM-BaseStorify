import { createHash, timingSafeEqual } from "node:crypto";
import { requestJson, type FetchLike } from "@/lib/esim/providers/http";
import { PaymentPluginError, type Credentials, type PayNotice, type PayRequest, type PayStart, type PaymentPlugin } from "./types";

/**
 * RedeePay (WeChat Pay, Alipay and others), as the old store called it
 * (`Gateway/RedeePay/ProcessController.php`): POST /api/order/create with an
 * MD5 signature over the sorted top-level scalar values, a signed answer
 * that is either a page to go to or data to show as a QR code, and a signed
 * notification that settles on notifyType "Paid" with orderStatus "Success".
 *
 * The route (paymentType|paymentScene|paymentMethod) depends on whether the
 * shopper is on a phone (H5) or a computer (PC); each payment method entry
 * sets its own routes (lib/esim/payments/registry.ts).
 *
 * Credentials: apiBaseUrl, merchantNo, tradeKey (secret), domain; optional
 * pcRoute, h5Route, defaultCountry, subject, billPhone.
 */

/** Sorted by key, values only, scalars only: what RedeePay signs. */
export function redeepaySignature(params: Record<string, unknown>, tradeKey: string): string {
  const plain = Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== null && params[key] !== undefined && params[key] !== "" && typeof params[key] !== "object")
    .sort()
    .map((key) => (params[key] === true ? "1" : params[key] === false ? "" : String(params[key])))
    .join("");
  return createHash("md5").update(plain + tradeKey, "utf8").digest("hex");
}

function signedBy(params: Record<string, unknown>, tradeKey: string) {
  const sign = typeof params.sign === "string" ? params.sign.toLowerCase() : "";
  const expected = redeepaySignature(params, tradeKey);
  return sign.length === expected.length && timingSafeEqual(Buffer.from(sign), Buffer.from(expected));
}

const MOBILE = /Mobile|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|MicroMessenger|AlipayClient/i;

export function redeepayRoute(credentials: Credentials, userAgent: string): [string, string, string] {
  const configured = MOBILE.test(userAgent) ? credentials.h5Route : credentials.pcRoute;
  const parts = String(configured ?? "")
    .split(/[|,/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 3) throw new PaymentPluginError("RedeePay route is not configured");
  return parts as [string, string, string];
}

const cut = (text: string | undefined, length: number) => String(text ?? "").trim().slice(0, length);

function apiBase(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
}

function host(domain: string) {
  try {
    return new URL(domain).host || domain.trim();
  } catch {
    return domain.trim();
  }
}

export const redeepayPlugin: PaymentPlugin = {
  code: "redeepay",
  credentialKeys: ["apiBaseUrl", "merchantNo", "tradeKey", "domain", "pcRoute", "h5Route", "defaultCountry", "subject", "billPhone"],
  secretKeys: ["tradeKey"],
  currencies: ["USD", "HKD", "CNY"],
  acknowledge: { accepted: "SUCCESS", rejected: "FAILED" },

  async start(request: PayRequest, credentials: Credentials, fetcher: FetchLike): Promise<PayStart> {
    if (!credentials.apiBaseUrl || !credentials.merchantNo || !credentials.tradeKey || !credentials.domain) {
      throw new PaymentPluginError("RedeePay is not configured");
    }
    const [paymentType, paymentScene, paymentMethod] = redeepayRoute(credentials, request.userAgent);
    const fallbackCountry = /^[A-Z]{2}$/.test(String(credentials.defaultCountry ?? "").toUpperCase()) ? credentials.defaultCountry.toUpperCase() : "HK";
    const country = /^[A-Z]{2}$/.test(request.country.toUpperCase()) ? request.country.toUpperCase() : fallbackCountry;
    const subject = cut(credentials.subject || "eSIM Order", 50);
    const address = {
      firstName: cut(request.billing.firstName || request.name.split(/\s+/)[0] || "Customer", 50),
      lastName: cut(request.billing.lastName || "User", 50),
      email: cut(request.email, 50),
      phone: cut(request.billing.phone || credentials.billPhone, 20),
      country,
      state: cut(request.billing.state || request.billing.city, 50),
      city: cut(request.billing.city, 50),
      address: cut(request.billing.street, 200),
      postalCode: cut(request.billing.postalCode || "000000", 20),
    };
    const payload: Record<string, unknown> = {
      merchantNo: credentials.merchantNo.trim(),
      merchantOrderNo: request.reference,
      paymentType,
      paymentScene,
      paymentMethod,
      currency: request.currency.toUpperCase(),
      amount: request.amountMinor,
      country,
      domain: host(credentials.domain),
      subject,
      returnUrl: request.returnUrl,
      notifyUrl: request.notifyUrl,
      device: {
        osType: /iPhone|iPad|iPod/i.test(request.userAgent) ? "iOS" : /Android/i.test(request.userAgent) ? "Android" : "Other",
        clientType: MOBILE.test(request.userAgent) ? "H5" : "PC",
        clientIP: request.clientIp,
        language: request.locale.toLowerCase().startsWith("zh") ? "ZH" : "EN",
        userAgent: cut(request.userAgent, 200),
      },
      payer: { id: request.payerId, name: cut(request.name, 50), email: cut(request.email, 50), phone: "" },
      bill: address,
      ship: address,
      products: [{ sku: request.reference, category: "order", name: subject, price: request.amountMinor, quantity: 1, url: request.returnUrl }],
    };
    payload.sign = redeepaySignature(payload, credentials.tradeKey);

    const { body } = await requestJson(fetcher, { method: "POST", url: `${apiBase(credentials.apiBaseUrl)}/api/order/create`, body: payload });
    const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? (body.data as Record<string, unknown>) : null;
    if (Number(body.code ?? 1) !== 0 || !data) {
      throw new PaymentPluginError(typeof body.msg === "string" && body.msg ? `RedeePay: ${body.msg}` : "RedeePay could not create the payment");
    }
    if (!signedBy(data, credentials.tradeKey)) throw new PaymentPluginError("RedeePay's answer is not signed correctly");
    const gatewayPaymentId = typeof data.orderNo === "string" ? data.orderNo : undefined;
    const pay = (data.pay ?? {}) as Record<string, unknown>;
    const payData = typeof pay.data === "string" ? pay.data : "";
    if (!payData) throw new PaymentPluginError("RedeePay returned no payment details");
    return pay.type === "Redirect" ? { kind: "redirect", url: payData, gatewayPaymentId } : { kind: "qr", data: payData, gatewayPaymentId };
  },

  readNotice(body: Record<string, unknown>, credentials: Credentials): PayNotice | null {
    const data = (body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : body) as Record<string, unknown>;
    if (!credentials.tradeKey || !signedBy(data, credentials.tradeKey)) return null;
    if (String(data.merchantNo ?? "") !== String(credentials.merchantNo ?? "").trim()) return null;
    const reference = typeof data.merchantOrderNo === "string" ? data.merchantOrderNo : "";
    if (!reference) return null;
    const amount = Number(data.amount);
    const paid = data.notifyType === "Paid" && data.orderStatus === "Success";
    return {
      reference,
      state: paid ? "paid" : data.orderStatus === "Closed" || data.orderStatus === "Failed" ? "failed" : "pending",
      gatewayPaymentId: typeof data.orderNo === "string" ? data.orderNo : undefined,
      amountMinor: Number.isInteger(amount) ? amount : null,
      currency: typeof data.currency === "string" ? data.currency.toUpperCase() : null,
    };
  },
};
