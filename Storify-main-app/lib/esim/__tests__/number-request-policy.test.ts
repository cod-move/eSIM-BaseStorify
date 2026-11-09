import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterQrLeg, canAffordQr } from "@/lib/esim/numbers/request-policy";

describe("new QR code requests", () => {
  it("waits for a person once the fee is taken, and closes when it is refused", () => {
    assert.equal(afterQrLeg("charge", "done"), "pending");
    assert.equal(afterQrLeg("charge", "refused"), "failed");
    assert.equal(afterQrLeg("charge", "wait"), "wait");
    assert.equal(afterQrLeg("charge", "manual"), "manual");
  });

  it("puts a declined fee back, or hands a failed refund to a person", () => {
    assert.equal(afterQrLeg("refund", "done"), "rejected");
    assert.equal(afterQrLeg("refund", "refused"), "manual");
  });

  it("leaves the card more than nothing after the fee", () => {
    assert.equal(canAffordQr(151, 150), true);
    assert.equal(canAffordQr(150, 150), false);
    assert.equal(canAffordQr(null, 150), "unknown");
    assert.equal(canAffordQr(null, 0), true);
  });
});
