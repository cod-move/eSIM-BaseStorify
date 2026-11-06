import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creditKind, partsOf, rowKinds } from "@/lib/esim/wallet/credit-parts";

describe("the balance by where it came from", () => {
  it("files a lot by its source", () => {
    assert.equal(creditKind("wallet_topup"), "topup");
    assert.equal(creditKind("goodwill"), "gift");
    assert.equal(creditKind("order_refund"), "refund");
    assert.equal(creditKind("return_refund"), "refund");
    assert.equal(creditKind(undefined), "gift");
  });

  it("splits the balance: topped up never expires, the gift does", () => {
    const parts = partsOf(
      [
        { source: "wallet_topup", remaining: 15 },
        { source: "wallet_topup", remaining: 5 },
        { source: "goodwill", remaining: 10, expiresAt: "2026-12-31T00:00:00.000Z" },
        { source: "order_refund", remaining: 0 },
      ],
      "USD",
    );
    assert.deepEqual(parts, [
      { kind: "topup", amount: 20, nextExpiry: null },
      { kind: "gift", amount: 10, nextExpiry: { amount: 10, expiresAt: "2026-12-31T00:00:00.000Z" } },
    ]);
  });

  it("says how much of a part expires first when not all of it does", () => {
    const [gift] = partsOf(
      [
        { source: "goodwill", remaining: 4, expiresAt: "2026-12-01T00:00:00.000Z" },
        { source: "goodwill", remaining: 6, expiresAt: "2027-03-01T00:00:00.000Z" },
        { source: "goodwill", remaining: 2 },
      ],
      "USD",
    );
    assert.deepEqual(gift, { kind: "gift", amount: 12, nextExpiry: { amount: 4, expiresAt: "2026-12-01T00:00:00.000Z" } });
  });

  it("tags a spend with the parts it took from", () => {
    const sources = new Map([["a", "wallet_topup"], ["b", "goodwill"]]);
    assert.deepEqual(rowKinds({ type: "issue", amount: 20, source: "wallet_topup" }, sources, "USD"), [{ kind: "topup", amount: 20 }]);
    assert.deepEqual(
      rowKinds({ type: "redeem", amount: 13, source: "order", lots: [{ lotId: "b", amount: 10 }, { lotId: "a", amount: 3 }] }, sources, "USD"),
      [{ kind: "topup", amount: 3 }, { kind: "gift", amount: 10 }],
    );
    assert.deepEqual(rowKinds({ type: "expire", amount: 5, source: "expiry", lots: [{ lotId: "x", amount: 5 }] }, sources, "USD"), []);
  });
});
