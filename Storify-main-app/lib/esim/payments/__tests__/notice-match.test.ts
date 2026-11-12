import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noticeMatch } from "../notice-match";

const payment = { amountMinor: 785, currency: "USD", gatewayPaymentId: "int_123" };

describe("a gateway's paid notice against the try", () => {
  it("accepts the amount and currency asked for, or a notice that names none", () => {
    assert.equal(noticeMatch(payment, { amountMinor: 785, currency: "usd", gatewayPaymentId: "int_123" }, false), "exact");
    assert.equal(noticeMatch(payment, { amountMinor: null, currency: null }, false), "exact");
  });

  it("refuses another amount in the same currency, whatever the gateway", () => {
    assert.equal(noticeMatch(payment, { amountMinor: 700, currency: "USD", gatewayPaymentId: "int_123" }, true), "wrong");
  });

  it("accepts the shopper's own currency from a converting gateway, for the intent we created", () => {
    assert.equal(noticeMatch(payment, { amountMinor: 5420, currency: "CNY", gatewayPaymentId: "int_123" }, true), "converted");
  });

  it("refuses another currency otherwise", () => {
    assert.equal(noticeMatch(payment, { amountMinor: 5420, currency: "CNY", gatewayPaymentId: "int_123" }, false), "wrong");
    assert.equal(noticeMatch(payment, { amountMinor: 5420, currency: "CNY", gatewayPaymentId: "int_other" }, true), "wrong");
    assert.equal(noticeMatch({ ...payment, gatewayPaymentId: undefined }, { amountMinor: 5420, currency: "CNY" }, true), "wrong");
    assert.equal(noticeMatch(payment, { amountMinor: 0, currency: "CNY", gatewayPaymentId: "int_123" }, true), "wrong");
  });
});
