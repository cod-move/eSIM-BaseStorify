import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardAdjustmentProblem, signedTransferMinor } from "../adjust-policy";
import { parseCardAmount } from "../op-policy";

describe("cardAdjustmentProblem", () => {
  it("adds any whole amount of cents, even when the balance is unknown", () => {
    assert.equal(cardAdjustmentProblem({ direction: "add", amountMinor: 500, balanceMinor: 0 }), null);
    assert.equal(cardAdjustmentProblem({ direction: "add", amountMinor: 500, balanceMinor: null }), null);
  });

  it("deducts down to zero, never below", () => {
    assert.equal(cardAdjustmentProblem({ direction: "deduct", amountMinor: 1000, balanceMinor: 1000 }), null);
    assert.match(cardAdjustmentProblem({ direction: "deduct", amountMinor: 1001, balanceMinor: 1000 })!, /more than/);
    assert.match(cardAdjustmentProblem({ direction: "deduct", amountMinor: 1, balanceMinor: 0 })!, /more than/);
    assert.match(cardAdjustmentProblem({ direction: "deduct", amountMinor: 1, balanceMinor: -50 })!, /more than/);
  });

  it("does not deduct when the balance could not be read", () => {
    assert.match(cardAdjustmentProblem({ direction: "deduct", amountMinor: 100, balanceMinor: null })!, /could not be read/);
    assert.match(cardAdjustmentProblem({ direction: "deduct", amountMinor: 100, balanceMinor: undefined })!, /could not be read/);
  });

  it("refuses bad amounts and blocked cards", () => {
    assert.ok(cardAdjustmentProblem({ direction: "add", amountMinor: 0, balanceMinor: 100 }));
    assert.ok(cardAdjustmentProblem({ direction: "add", amountMinor: 1.5, balanceMinor: 100 }));
    assert.ok(cardAdjustmentProblem({ direction: "add", amountMinor: 100_001, balanceMinor: 100 }));
    assert.match(cardAdjustmentProblem({ direction: "add", amountMinor: 100, balanceMinor: 100, blocked: true })!, /blocked/);
  });
});

describe("signedTransferMinor", () => {
  it("is negative for a deduction (TopConnect sbalance moves it back)", () => {
    assert.equal(signedTransferMinor("add", 250), 250);
    assert.equal(signedTransferMinor("deduct", 250), -250);
  });
});

describe("parseCardAmount (the dialog's input)", () => {
  it("reads cents without floating point", () => {
    assert.equal(parseCardAmount("12.5"), 1250);
    assert.equal(parseCardAmount("0.29"), 29);
    assert.equal(parseCardAmount("0"), null);
    assert.equal(parseCardAmount("1.234"), null);
  });
});
