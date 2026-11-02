import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { feeRuleFor, paymentFeeLabel, paymentFeeMinor } from "../fee-rules";

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
