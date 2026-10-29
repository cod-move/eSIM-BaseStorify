import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { esimUnitOutcome, topupUnitOutcome } from "../unit-status";

describe("esimUnitOutcome", () => {
  it("is being prepared until bought, held for review included", () => {
    for (const state of ["review", "queued", "purchasing", "provider_pending"]) {
      assert.equal(esimUnitOutcome({ state }), "preparing");
    }
  });

  it("is issued, or cancelled once called off or refunded", () => {
    assert.equal(esimUnitOutcome({ state: "fulfilled", profileStatus: "fulfilled" }), "issued");
    assert.equal(esimUnitOutcome({ state: "fulfilled", cancelled: true }), "cancelled");
    assert.equal(esimUnitOutcome({ state: "fulfilled", profileStatus: "refunded" }), "cancelled");
  });

  it("tells a refund made from one still owed", () => {
    assert.equal(esimUnitOutcome({ state: "failed", refundState: "done" }), "refunded");
    assert.equal(esimUnitOutcome({ state: "failed", refundState: "manual" }), "refund_pending");
    assert.equal(esimUnitOutcome({ state: "failed", refundState: null }), "refund_pending");
  });
});

describe("topupUnitOutcome", () => {
  it("follows the top-up's state", () => {
    assert.equal(topupUnitOutcome({ state: "completed" }), "issued");
    assert.equal(topupUnitOutcome({ state: "processing" }), "preparing");
    assert.equal(topupUnitOutcome({ state: "failed", refundState: "done" }), "refunded");
  });
});
