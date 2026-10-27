import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { fakeFetch } from "@/lib/esim/providers/__tests__/helpers";
import { bepusdtPlugin, bepusdtSignature } from "../plugins/bepusdt";
import { redeepayPlugin, redeepayRoute, redeepaySignature } from "../plugins/redeepay";
import { fakeNoticeBody, fakePaymentPlugin } from "../plugins/fake";
import type { PayRequest } from "../plugins/types";

const md5 = (text: string) => createHash("md5").update(text).digest("hex");

const request: PayRequest = {
  reference: "EP0123456789ABCDEF0123",
  amountMinor: 1050,
  currency: "USD",
  subject: "eSIM Order",
  returnUrl: "https://shop.test/esim/pay/ext1?payment=EP0123456789ABCDEF0123",
  notifyUrl: "https://shop.test/api/esim/pay/notify/bepusdt",
  email: "shopper@example.test",
  name: "Ada Lovelace",
  country: "GB",
  clientIp: "203.0.113.9",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  locale: "zh",
  payerId: "u1",
  billing: { firstName: "Ada", lastName: "Lovelace", phone: "", state: "", city: "London", street: "1 Street", postalCode: "N1" },
};

describe("BEpusdt", () => {
  const credentials = { apiUrl: "https://pay.example.test/", apiToken: "tok", cryptos: "USDT", orderName: "eSIM Order", timeout: "1200" };

  it("signs sorted, non-empty fields as key=value&… plus the token, as PHP stringifies them", () => {
    const params = { order_id: "A1", amount: 10.5, empty: "", none: null, status: 2, signature: "x", flag: true };
    assert.equal(bepusdtSignature(params, "tok"), md5("amount=10.5&flag=1&order_id=A1&status=2tok"));
    assert.equal(bepusdtSignature({ amount: 10 }, "tok"), md5("amount=10tok"), "a whole amount has no decimals");
  });

  it("creates the order and sends the shopper to its page", async () => {
    const { fetch, sent } = fakeFetch({
      "POST /api/v1/order/create-order": () => ({ body: { status_code: 200, data: { trade_id: "T1", payment_url: "https://pay.example.test/pay/T1" } } }),
    });
    const started = await bepusdtPlugin.start(request, credentials, fetch);
    assert.deepEqual(started, { kind: "redirect", url: "https://pay.example.test/pay/T1", gatewayPaymentId: "T1" });
    const body = JSON.parse(sent[0].body!);
    assert.equal(body.order_id, request.reference);
    assert.equal(body.amount, 10.5);
    assert.equal(body.fiat, "USD");
    assert.equal(body.currencies, "USDT");
    assert.equal(body.timeout, 1200);
    const { signature, ...signed } = body;
    assert.equal(signature, bepusdtSignature(signed, "tok"));
  });

  it("refuses a failed answer", async () => {
    const { fetch } = fakeFetch({ "POST /api/v1/order/create-order": () => ({ body: { status_code: 400, message: "bad amount" } }) });
    await assert.rejects(bepusdtPlugin.start(request, credentials, fetch), /BEpusdt: bad amount/);
  });

  it("reads a signed notification and refuses a forged one", () => {
    const body: Record<string, unknown> = { trade_id: "T1", order_id: request.reference, amount: 10.5, actual_amount: 10.52, token: "TRX", block_transaction_id: "abc", status: 2 };
    body.signature = bepusdtSignature(body, "tok");
    assert.deepEqual(bepusdtPlugin.readNotice(body, credentials), { reference: request.reference, state: "paid", gatewayPaymentId: "T1", amountMinor: 1050, currency: null });
    assert.equal(bepusdtPlugin.readNotice({ ...body, amount: 1 }, credentials), null, "changed after signing");
    assert.equal(bepusdtPlugin.readNotice(body, { ...credentials, apiToken: "other" }), null);
    const expired: Record<string, unknown> = { ...body, status: 3 };
    expired.signature = bepusdtSignature(expired, "tok");
    assert.equal(bepusdtPlugin.readNotice(expired, credentials)?.state, "expired");
  });
});

describe("RedeePay", () => {
  const credentials = {
    apiBaseUrl: "https://api.redee.test/api",
    merchantNo: "M100",
    tradeKey: "key",
    domain: "https://shop.test",
    pcRoute: "Native|Native|WeChat",
    h5Route: "Wallet|H5|WeChat",
    defaultCountry: "HK",
  };

  it("signs the sorted scalar values only, without their keys", () => {
    assert.equal(redeepaySignature({ b: "2", a: 1, nested: { x: 1 }, list: [1], empty: "", sign: "s" }, "key"), md5("12key"));
  });

  it("picks the route by device", () => {
    assert.deepEqual(redeepayRoute(credentials, request.userAgent), ["Native", "Native", "WeChat"]);
    assert.deepEqual(redeepayRoute(credentials, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), ["Wallet", "H5", "WeChat"]);
    assert.throws(() => redeepayRoute({ ...credentials, pcRoute: "Native|WeChat" }, request.userAgent), /not configured/);
  });

  it("creates the order and hands back QR data, checking the answer's signature", async () => {
    const answer: Record<string, unknown> = { merchantNo: "M100", merchantOrderNo: request.reference, orderNo: "R1", amount: 1050, currency: "USD", orderStatus: "Pending", pay: { type: "QRCode", data: "weixin://wxpay/bizpayurl?pr=abc" } };
    answer.sign = redeepaySignature(answer, "key");
    const { fetch, sent } = fakeFetch({ "POST /api/order/create": () => ({ body: { code: 0, data: answer } }) });
    const started = await redeepayPlugin.start(request, credentials, fetch);
    assert.deepEqual(started, { kind: "qr", data: "weixin://wxpay/bizpayurl?pr=abc", gatewayPaymentId: "R1" });
    assert.equal(sent[0].url.toString(), "https://api.redee.test/api/order/create", "a trailing /api is not doubled");
    const body = JSON.parse(sent[0].body!);
    assert.equal(body.amount, 1050, "minor units");
    assert.equal(body.domain, "shop.test");
    assert.equal(body.country, "GB");
    assert.equal(body.device.language, "ZH");
    assert.equal(body.sign, redeepaySignature(body, "key"));

    const forged = { ...answer, amount: 1 };
    const { fetch: forgedFetch } = fakeFetch({ "POST /api/order/create": () => ({ body: { code: 0, data: forged } }) });
    await assert.rejects(redeepayPlugin.start(request, credentials, forgedFetch), /not signed correctly/);
  });

  it("settles only a signed Paid/Success notification from our merchant", () => {
    const data: Record<string, unknown> = { merchantNo: "M100", merchantOrderNo: request.reference, orderNo: "R1", amount: 1050, currency: "usd", notifyType: "Paid", orderStatus: "Success" };
    data.sign = redeepaySignature(data, "key");
    assert.deepEqual(redeepayPlugin.readNotice({ data }, credentials), { reference: request.reference, state: "paid", gatewayPaymentId: "R1", amountMinor: 1050, currency: "USD" });
    assert.equal(redeepayPlugin.readNotice(data, credentials)?.state, "paid", "also without the data wrapper");
    assert.equal(redeepayPlugin.readNotice({ data }, { ...credentials, merchantNo: "M999" }), null, "another merchant");
    assert.equal(redeepayPlugin.readNotice({ data: { ...data, amount: 1 } }, credentials), null, "changed after signing");
    const pending: Record<string, unknown> = { ...data, notifyType: "Created", orderStatus: "Pending" };
    pending.sign = redeepaySignature(pending, "key");
    assert.equal(redeepayPlugin.readNotice(pending, credentials)?.state, "pending");
  });
});

describe("the fake gateway", () => {
  it("round-trips a signed notice and refuses a tampered one", async () => {
    const started = await fakePaymentPlugin.start(request, { secret: "s" }, fetch);
    assert.equal(started.kind, "redirect");
    assert.match(started.kind === "redirect" ? started.url : "", /fake=1/);
    const body = fakeNoticeBody({ reference: "EP1", state: "paid", amountMinor: 500, currency: "USD" }, "s");
    assert.equal(fakePaymentPlugin.readNotice(body, { secret: "s" })?.state, "paid");
    assert.equal(fakePaymentPlugin.readNotice({ ...body, amountMinor: 1 }, { secret: "s" }), null);
    assert.equal(fakePaymentPlugin.readNotice(body, { secret: "other" }), null);
  });
});
