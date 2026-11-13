import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterActivation, afterTransfer, MAX_UNCERTAIN_ACTIVATIONS, MAX_UNCERTAIN_TRANSFERS } from "../numbers/op-policy";
import { refundAmount } from "../fulfillment/refund-amount";

describe("number card transfers: an id already used by a completed order", () => {
  it("takes a fresh id when the first send of the id hits someone else's order", () => {
    assert.deepEqual(afterTransfer({ orderId: 3153, tries: 0 }, { kind: "taken" }), { do: "fresh_id" });
  });

  it("checks the card's log on a resend, since the order may be ours", () => {
    const sent = { orderId: 3153, tries: 1 };
    assert.deepEqual(afterTransfer(sent, { kind: "taken" }), { do: "check_log" });
    assert.deepEqual(afterTransfer(sent, { kind: "taken" }, true), { do: "done", last: 3153 });
    assert.deepEqual(afterTransfer(sent, { kind: "taken" }, false), { do: "fresh_id" });
    assert.equal(afterTransfer(sent, { kind: "taken" }, null).do, "manual");
  });
});

describe("number card transfers", () => {
  it("is done on an answer, and refused on a refusal", () => {
    assert.deepEqual(afterTransfer({ orderId: 41, tries: 0 }, { kind: "ok" }), { do: "done", last: 41 });
    assert.deepEqual(afterTransfer({ orderId: 41, tries: 0 }, { kind: "refused", message: "Debit balance limit exceeded" }), { do: "refused", message: "Debit balance limit exceeded" });
  });

  it("takes the id TopConnect names when the store's counter was behind", () => {
    assert.deepEqual(afterTransfer({ orderId: 41, tries: 0 }, { kind: "clash", expected: 57 }), { do: "resend", orderId: 57 });
    // Resent, but the id was never used: still nothing moved.
    assert.deepEqual(afterTransfer({ orderId: 41, tries: 2 }, { kind: "clash", expected: 41 }), { do: "resend", orderId: 41 });
  });

  it("asks the card's log when a resent id turns out to be used", () => {
    const sent = { orderId: 41, tries: 1 };
    const clash = { kind: "clash" as const, expected: 42 };
    assert.deepEqual(afterTransfer(sent, clash), { do: "check_log" });
    assert.deepEqual(afterTransfer(sent, clash, true), { do: "done", last: 41 }, "our lost answer went through");
    assert.deepEqual(afterTransfer(sent, clash, false), { do: "resend", orderId: 42 }, "someone else used the id: ours never moved");
    assert.equal(afterTransfer(sent, clash, null).do, "manual");
  });

  it("waits on unclear answers, then hands over to a person", () => {
    assert.deepEqual(afterTransfer({ orderId: 41, tries: 0 }, { kind: "uncertain", message: "504" }), { do: "wait" });
    assert.equal(afterTransfer({ orderId: 41, tries: MAX_UNCERTAIN_TRANSFERS - 1 }, { kind: "uncertain", message: "504" }).do, "manual");
  });

  it("switches a package on, or moves its price back", () => {
    assert.deepEqual(afterActivation(0, { kind: "ok" }), { do: "done" });
    assert.deepEqual(afterActivation(0, { kind: "uncertain", listed: true }), { do: "done" });
    assert.deepEqual(afterActivation(0, { kind: "uncertain", listed: false }), { do: "wait" });
    assert.equal(afterActivation(MAX_UNCERTAIN_ACTIVATIONS - 1, { kind: "uncertain", listed: false }).do, "roll_back");
    assert.equal(afterActivation(0, { kind: "refused", message: "Packet not found" }).do, "roll_back");
  });

  it("refunds a failed part of a line, spread like a unit", () => {
    // A $50 number line with a $12 package that failed, on a $45 order (a $5 discount).
    assert.equal(refundAmount({ total: 45, items: [{ price: 50, quantity: 1 }], units: [], parts: [1200], refundable: 45 }), 10.8);
    assert.equal(refundAmount({ total: 50, items: [{ price: 50, quantity: 1 }], units: [], parts: [5000], refundable: 50 }), 50);
  });
});
