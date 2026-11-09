import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { fakeFetch } from "@/lib/esim/providers/__tests__/helpers";
import { airwallexAmount, airwallexMinor, airwallexPlugin, airwallexSignature, forgetAirwallexTokens } from "../plugins/airwallex";
import { IGNORED_NOTICE, type PayNotice, type PayRequest } from "../plugins/types";

const stateOf = (notice: PayNotice | typeof IGNORED_NOTICE | null) => (notice && notice !== IGNORED_NOTICE ? notice.state : notice);

const request: PayRequest = {
  reference: "EP0123456789ABCDEF0123",
  amountMinor: 1050,
  currency: "USD",
  subject: "eSIM Order",
  returnUrl: "https://shop.test/esim/pay/ext1?payment=EP0123456789ABCDEF0123",
  notifyUrl: "https://shop.test/api/esim/pay/notify/airwallex",
  email: "shopper@example.test",
  name: "Ada Lovelace",
  country: "GB",
  clientIp: "203.0.113.9",
  userAgent: "Mozilla/5.0",
  locale: "zh-hant",
  payerId: "u1",
  billing: { firstName: "Ada", lastName: "Lovelace", phone: "", state: "", city: "", street: "", postalCode: "" },
};
const credentials = { clientId: "cid", apiKey: "key", webhookSecret: "whsec", env: "demo", methods: "card, wechatpay" };

describe("Airwallex", () => {
  beforeEach(() => forgetAirwallexTokens());

  it("converts amounts without floats", () => {
    assert.equal(airwallexAmount(1050), "10.50");
    assert.equal(airwallexAmount(5), "0.05");
    assert.equal(airwallexMinor("10.5"), 1050);
    assert.equal(airwallexMinor(10.5), 1050);
    assert.equal(airwallexMinor("abc"), null);
  });

  it("logs in once, creates an intent and sends the shopper to the launch page", async () => {
    let logins = 0;
    const { fetch, sent } = fakeFetch({
      "POST /api/v1/authentication/login": () => {
        logins += 1;
        return { body: { token: "tok", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() } };
      },
      "POST /api/v1/pa/payment_intents/create": () => ({ status: 201, body: { id: "int_abc123456", client_secret: "secret_value_123" } }),
    });
    const started = await airwallexPlugin.start(request, credentials, fetch);
    await airwallexPlugin.start(request, credentials, fetch);
    assert.equal(logins, 1);
    assert.equal(sent[0].url.host, "api.sandbox.airwallex.com");
    assert.equal(sent[0].headers["x-client-id"], "cid");
    const body = JSON.parse(sent[1].body ?? "{}");
    assert.equal(body.amount, "10.50");
    assert.equal(body.merchant_order_id, request.reference);
    assert.equal(sent[1].headers.Authorization, "Bearer tok");
    assert.equal(started.kind, "redirect");
    const url = new URL(started.kind === "redirect" ? started.url : "");
    assert.equal(url.origin + url.pathname, "https://shop.test/api/esim/pay/airwallex");
    assert.equal(url.searchParams.get("intent"), "int_abc123456");
    assert.equal(url.searchParams.get("locale"), "zh-HK");
    assert.equal(url.searchParams.get("methods"), "card,wechatpay");
    assert.equal(url.searchParams.get("back"), request.returnUrl);
  });

  it("refuses to start without credentials", async () => {
    await assert.rejects(airwallexPlugin.start(request, { env: "prod" }, fakeFetch({}).fetch), /not configured/);
  });

  it("reads signed payment_intent events only", () => {
    const now = Date.now();
    const notice = (name: string, object: Record<string, unknown>, secret = "whsec", ts = String(now)) => {
      const raw = JSON.stringify({ name, data: { object } });
      return airwallexPlugin.readNotice(JSON.parse(raw), credentials, { raw, now, headers: { "x-timestamp": ts, "x-signature": airwallexSignature(ts, raw, secret) } });
    };
    const intent = { id: "int_1", merchant_order_id: request.reference, status: "SUCCEEDED", amount: 10.5, currency: "usd" };
    assert.deepEqual(notice("payment_intent.succeeded", intent), { reference: request.reference, state: "paid", gatewayPaymentId: "int_1", amountMinor: 1050, currency: "USD" });
    assert.equal(stateOf(notice("payment_intent.cancelled", { ...intent, status: "CANCELLED" })), "failed");
    assert.equal(notice("payment_attempt.authorized", intent), IGNORED_NOTICE);
    assert.equal(notice("payment_intent.succeeded", { ...intent, merchant_order_id: "storify-1" }), IGNORED_NOTICE, "not one of ours");
    assert.equal(notice("payment_intent.succeeded", intent, "other"), null, "wrong secret");
    assert.equal(notice("payment_intent.succeeded", intent, "whsec", String(now - 10 * 60_000)), null, "too old");
  });
});
