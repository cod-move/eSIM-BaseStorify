import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ReferralCodeError,
  commissionAllowed,
  commissionBase,
  commissionFor,
  generateCode,
  normalizeCode,
  referralValidUntil,
} from "../rules";

describe("referral codes", () => {
  it("normalizes a chosen code and refuses bad or reserved ones", () => {
    assert.equal(normalizeCode("  travel24 "), "TRAVEL24");
    assert.throws(() => normalizeCode("abc"), ReferralCodeError);
    assert.throws(() => normalizeCode("has space"), ReferralCodeError);
    assert.throws(() => normalizeCode("x".repeat(17)), ReferralCodeError);
    assert.throws(() => normalizeCode("admin"), /reserved/);
  });

  it("generates 8 characters without look-alikes", () => {
    let seed = 0;
    const code = generateCode(() => ((seed += 0.137) % 1));
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.doesNotThrow(() => normalizeCode(code));
  });
});

describe("commissionFor", () => {
  it("a percent of the base, rounded down", () => {
    assert.equal(commissionFor(20, { commissionType: "percent", commissionValue: 10 }), 2);
    assert.equal(commissionFor(19.99, { commissionType: "percent", commissionValue: 10 }), 1.99);
    assert.equal(commissionFor(0, { commissionType: "percent", commissionValue: 10 }), 0);
  });

  it("a fixed amount in cents, never more than the base", () => {
    assert.equal(commissionFor(20, { commissionType: "fixed", commissionValue: 300 }), 3);
    assert.equal(commissionFor(2, { commissionType: "fixed", commissionValue: 300 }), 2);
  });
});

describe("commissionBase", () => {
  it("what the order paid, less refunds and wallet top-ups", () => {
    assert.equal(commissionBase({ total: 20, items: [{ price: 20, quantity: 1 }] }), 20);
    assert.equal(commissionBase({ total: 20, refundedTotal: 5, items: [{ price: 20, quantity: 1 }] }), 15);
    assert.equal(commissionBase({ total: 20, refundedTotal: 25, items: [{ price: 20, quantity: 1 }] }), 0);
    const wallet = { price: 50.3, quantity: 1, lineAttributes: { wallet: 5000, walletFee: 30 } };
    assert.equal(commissionBase({ total: 50.3, items: [wallet] }), 0.3, "buying balance earns only on its fee");
  });
});

describe("commissionAllowed", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const on = { enabled: true, orderLimit: 0 };
  it("while the referral is valid, within the order limit", () => {
    assert.deepEqual(commissionAllowed({ validUntil: null, orderDate: now, earnedSoFar: 99 }, on), { ok: true });
    assert.deepEqual(commissionAllowed({ validUntil: new Date(now.getTime() - 1), orderDate: now, earnedSoFar: 0 }, on), { ok: false, reason: "expired" });
    assert.deepEqual(commissionAllowed({ validUntil: null, orderDate: now, earnedSoFar: 1 }, { enabled: true, orderLimit: 1 }), { ok: false, reason: "limit" });
    assert.deepEqual(commissionAllowed({ validUntil: null, orderDate: now, earnedSoFar: 0 }, { enabled: true, orderLimit: 1 }), { ok: true }, "first order only");
    assert.deepEqual(commissionAllowed({ validUntil: null, orderDate: now, earnedSoFar: 0 }, { enabled: false, orderLimit: 0 }), { ok: false, reason: "disabled" });
  });

  it("validity runs from sign-up", () => {
    assert.equal(referralValidUntil(now, 0), null);
    assert.equal(referralValidUntil(now, 30)?.toISOString(), "2026-11-26T12:00:00.000Z");
  });
});
