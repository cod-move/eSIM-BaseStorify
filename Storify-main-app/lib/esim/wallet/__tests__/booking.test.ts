import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { walletAttributesOf, walletCreditOf, walletCreditOfOrder, walletFeeMinor } from "../booking";

describe("walletFeeMinor", () => {
  it("fixed plus percent, rounded up to the cent", () => {
    assert.equal(walletFeeMinor(5000, { feeFixedMinor: 0, feePercent: 0 }), 0);
    assert.equal(walletFeeMinor(5000, { feeFixedMinor: 30, feePercent: 0 }), 30);
    assert.equal(walletFeeMinor(5000, { feeFixedMinor: 0, feePercent: 2.9 }), 145);
    assert.equal(walletFeeMinor(1234, { feeFixedMinor: 30, feePercent: 2.9 }), 30 + 36, "35.786 cents rounds up to 36");
    assert.equal(walletFeeMinor(1000, { feeFixedMinor: 0, feePercent: 3 }), 30, "exactly 30, not 31");
  });
});

describe("walletAttributesOf", () => {
  it("reads a top-up line, nothing else", () => {
    assert.deepEqual(walletAttributesOf({ lineAttributes: { wallet: 5000, walletFee: 150 } }), { wallet: 5000, walletFee: 150 });
    assert.deepEqual(walletAttributesOf({ lineAttributes: { wallet: 5000 } }), { wallet: 5000, walletFee: 0 });
    assert.equal(walletAttributesOf({ lineAttributes: { days: 7 } }), null);
    assert.equal(walletAttributesOf({ lineAttributes: { wallet: 0 } }), null);
    assert.equal(walletAttributesOf({ lineAttributes: { wallet: 12.5 } }), null);
    assert.equal(walletAttributesOf({}), null);
  });
});

describe("walletCreditOf", () => {
  const line = { price: 51.5, quantity: 1, lineAttributes: { wallet: 5000, walletFee: 150 } };

  it("the amount, when the whole line was paid", () => {
    assert.equal(walletCreditOf([line], 51.5), 50);
  });

  it("a coupon takes its share off the amount and the fee alike", () => {
    // 10% off: 46.35 paid for goods; the amount's share is 46.35 × 50 / 51.5 = 45.
    assert.equal(walletCreditOf([line], 46.35), 45);
  });

  it("never more than the amount, never below zero", () => {
    assert.equal(walletCreditOf([line], 100), 50);
    assert.equal(walletCreditOf([line], 0), 0);
    assert.equal(walletCreditOf([{ price: 10, quantity: 1 }], 10), 0, "no top-up line");
    assert.equal(walletCreditOf(null, 10), 0);
  });

  it("rounds down to the cent", () => {
    const odd = { price: 10.03, quantity: 1, lineAttributes: { wallet: 1000, walletFee: 3 } };
    assert.equal(walletCreditOf([odd], 9), 8.97, "9 × 1000 / 1003 = 8.973…");
  });
});

describe("walletCreditOfOrder", () => {
  it("takes the goods as total − tax − shipping − duty", () => {
    const items = [{ price: 51.5, quantity: 1, lineAttributes: { wallet: 5000, walletFee: 150 } }];
    assert.equal(walletCreditOfOrder({ items, total: 51.5 }), 50);
    assert.equal(walletCreditOfOrder({ items, total: 56.65, tax: 5.15 }), 50, "tax is not goods");
    assert.equal(walletCreditOfOrder({ items: [], total: 51.5 }), 0);
  });
});
