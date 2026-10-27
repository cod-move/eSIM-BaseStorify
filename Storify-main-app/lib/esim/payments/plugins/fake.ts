import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentPluginError, type Credentials, type PayNotice, type PayRequest, type PayStart, type PaymentPlugin } from "./types";

/**
 * A payment gateway that takes no money, for tests and development only.
 *
 * Starting a payment sends the shopper straight back to the return page (or,
 * with `mode: "qr"`, hands back QR data). A notification is
 * `{ reference, state, amountMinor, currency, gatewayPaymentId, sig }` where
 * `sig` is an HMAC-SHA256 of the other fields, joined with "|", under the
 * `secret` credential — `fakeNoticeBody` builds one.
 */

const FIELDS = ["reference", "state", "amountMinor", "currency", "gatewayPaymentId"] as const;

function sign(body: Record<string, unknown>, secret: string) {
  return createHmac("sha256", secret)
    .update(FIELDS.map((field) => String(body[field] ?? "")).join("|"))
    .digest("hex");
}

export function fakeNoticeBody(notice: Omit<PayNotice, "gatewayPaymentId"> & { gatewayPaymentId?: string }, secret: string) {
  const body: Record<string, unknown> = { ...notice, gatewayPaymentId: notice.gatewayPaymentId ?? `fake-${notice.reference}` };
  return { ...body, sig: sign(body, secret) };
}

export const fakePaymentPlugin: PaymentPlugin = {
  code: "fake",
  credentialKeys: ["secret", "mode"],
  secretKeys: ["secret"],
  currencies: ["USD"],
  acknowledge: { accepted: "ok", rejected: "rejected" },

  async start(request: PayRequest, credentials: Credentials): Promise<PayStart> {
    if (process.env.NODE_ENV === "production") throw new PaymentPluginError("The fake payment gateway is not available");
    if (!credentials.secret) throw new PaymentPluginError("The fake payment gateway is not configured");
    const gatewayPaymentId = `fake-${request.reference}`;
    if (credentials.mode === "qr") return { kind: "qr", data: `fakepay://${request.reference}?amount=${request.amountMinor}`, gatewayPaymentId };
    const url = new URL(request.returnUrl);
    url.searchParams.set("fake", "1");
    return { kind: "redirect", url: url.toString(), gatewayPaymentId };
  },

  readNotice(body: Record<string, unknown>, credentials: Credentials): PayNotice | null {
    if (process.env.NODE_ENV === "production" || !credentials.secret) return null;
    const sig = typeof body.sig === "string" ? body.sig : "";
    const expected = sign(body, credentials.secret);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const state = String(body.state);
    if (!["pending", "paid", "failed", "expired"].includes(state) || typeof body.reference !== "string") return null;
    const amount = Number(body.amountMinor);
    return {
      reference: body.reference,
      state: state as PayNotice["state"],
      gatewayPaymentId: typeof body.gatewayPaymentId === "string" ? body.gatewayPaymentId : undefined,
      amountMinor: Number.isInteger(amount) ? amount : null,
      currency: typeof body.currency === "string" ? body.currency : null,
    };
  },
};
