import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewReasons } from "../risk";

describe("reviewReasons", () => {
  const settings = { reviewOverMinor: 10_000, maxOrders: 3, windowHours: 24 };

  it("buys at once below every limit, or with the rules off", () => {
    assert.deepEqual(reviewReasons({ totalMinor: 9_999, recentOrders: 2 }, settings), []);
    assert.deepEqual(reviewReasons({ totalMinor: 1_000_000, recentOrders: 99 }, { reviewOverMinor: 0, maxOrders: 0, windowHours: 24 }), []);
    assert.deepEqual(reviewReasons({ totalMinor: 1_000_000, recentOrders: 99 }, null), []);
  });

  it("holds a large order", () => {
    const reasons = reviewReasons({ totalMinor: 10_000, recentOrders: 0 }, settings);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /100\.00/);
  });

  it("holds a buyer's order past the count in the window", () => {
    const reasons = reviewReasons({ totalMinor: 500, recentOrders: 3 }, settings);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /3 eSIM order\(s\) in the last 24 hour/);
    assert.equal(reviewReasons({ totalMinor: 20_000, recentOrders: 5 }, settings).length, 2);
  });
});
