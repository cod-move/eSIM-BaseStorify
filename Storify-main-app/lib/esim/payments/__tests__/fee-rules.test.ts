import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { feeRuleFor, PAYMENT_FEE_METHODS, paymentFeeLabel, paymentFeeMinor } from "../fee-rules";
import { feeMethodOf, isExtensionChoice, splitPaymentChoice } from "../method-names";

const rules = [
  { method: "card", fixedMinor: 30, percent: 3 },
  { method: "paypal", fixedMinor: 0, percent: 0 },
  { method: "extension", fixedMinor: 0, percent: 1.5 },
];

describe("payment fees", () => {
  it("finds a method's rule, and none for the balance or a method that charges nothing", () => {
    assert.equal(feeRuleFor(rules, "card")?.fixedMinor, 30);
    assert.equal(feeRuleFor(rules, "paypal"), null);
    assert.equal(feeRuleFor(rules, "cod"), null);
    assert.equal(feeRuleFor(rules, "store_credit"), null);
    assert.equal(feeRuleFor(rules, undefined), null);
    assert.equal(feeRuleFor(null, "card"), null);
  });

  it("adds the percent, rounded to the cent, to the fixed part", () => {
    assert.equal(paymentFeeMinor(feeRuleFor(rules, "card"), 450), 44); // 13.5 → 14, + 30
    assert.equal(paymentFeeMinor(feeRuleFor(rules, "extension"), 1999), 30); // 29.985 → 30
    assert.equal(paymentFeeMinor(feeRuleFor(rules, "card"), 0), 0);
    assert.equal(paymentFeeMinor(null, 1000), 0);
  });

  it("caps the percent", () => {
    assert.equal(paymentFeeMinor({ method: "card", fixedMinor: 0, percent: 90 }, 1000), 200);
  });

  it("names the method on the line", () => {
    assert.equal(paymentFeeLabel("card"), "Card");
    assert.equal(paymentFeeLabel("other"), "other");
  });
});

describe("a fee per eSIM payment method", () => {
  it("keys each method's fee as extension:<code>, and plain extension when none was chosen", () => {
    assert.equal(feeMethodOf("extension", "stripe"), "extension:stripe");
    assert.equal(feeMethodOf("extension", undefined), "extension");
    assert.equal(feeMethodOf("extension", "Bad Code!"), "extension");
    assert.equal(feeMethodOf("card", "stripe"), "card", "only an eSIM method has one");
    const perMethod = [
      { method: "extension:stripe", fixedMinor: 0, percent: 3 },
      { method: "extension:bepusdt", fixedMinor: 0, percent: 0 },
    ];
    assert.equal(paymentFeeMinor(feeRuleFor(perMethod, feeMethodOf("extension", "stripe")), 1000), 30);
    assert.equal(feeRuleFor(perMethod, feeMethodOf("extension", "bepusdt")), null);
    assert.equal(feeRuleFor(perMethod, "extension"), null, "the shopper app's rule is its own");
  });

  it("lists every eSIM method for a fee, named, and splits a checkout row's value", () => {
    const methods = PAYMENT_FEE_METHODS.map((entry) => entry.method);
    for (const code of ["stripe", "bepusdt", "redeepay-wechat", "redeepay-alipay"]) assert.ok(methods.includes(`extension:${code}`), code);
    assert.ok(methods.includes("extension") && methods.includes("card"));
    assert.equal(new Set(methods).size, methods.length);
    assert.equal(paymentFeeLabel("extension:bepusdt"), "USDT / USDC (BEpusdt)");
    assert.deepEqual(splitPaymentChoice("extension:redeepay-wechat"), { paymentMethod: "extension", extensionMethod: "redeepay-wechat" });
    assert.deepEqual(splitPaymentChoice("card"), { paymentMethod: "card" });
    assert.equal(isExtensionChoice("extension:"), false);
  });
});
