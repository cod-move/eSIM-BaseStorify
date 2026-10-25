import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { refundAmount } from "../refund-amount";

describe("refundAmount", () => {
  it("refunds what was paid for the failed units, discount spread in proportion", () => {
    // Lines: 2 × 4.99 + 1 × 9.99 = 19.97; a coupon brought the total to 15.97.
    const items = [{ price: 4.99, quantity: 2 }, { price: 9.99, quantity: 1 }];
    assert.equal(refundAmount({ total: 15.97, items, units: [0], refundable: 15.97 }), 3.99);
    assert.equal(refundAmount({ total: 15.97, items, units: [1], refundable: 15.97 }), 7.98);
  });

  it("refunds everything left when every unit failed", () => {
    const items = [{ price: 4.99, quantity: 2 }];
    assert.equal(refundAmount({ total: 9.98, items, units: [0, 0], refundable: 9.98 }), 9.98);
  });

  it("never exceeds what is still refundable", () => {
    const items = [{ price: 4.99, quantity: 1 }, { price: 9.99, quantity: 1 }];
    assert.equal(refundAmount({ total: 14.98, items, units: [1], refundable: 5 }), 5);
    assert.equal(refundAmount({ total: 14.98, items, units: [1], refundable: 0 }), 0);
  });
});
