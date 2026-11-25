import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyNumberPriceChange, numberDiscountMinor, numberSellingMinor } from "@/lib/esim/numbers/price";

describe("a number's discount price", () => {
  it("sells at the discount only while it is below the price", () => {
    assert.equal(numberSellingMinor({ priceMinor: 1000, salePriceMinor: 800 }), 800);
    assert.equal(numberDiscountMinor({ priceMinor: 1000, salePriceMinor: 800 }), 800);
    assert.equal(numberSellingMinor({ priceMinor: 1000, salePriceMinor: 1000 }), 1000);
    assert.equal(numberDiscountMinor({ priceMinor: 1000, salePriceMinor: 1200 }), null);
    assert.equal(numberSellingMinor({ priceMinor: 1000, salePriceMinor: null }), 1000);
    assert.equal(numberSellingMinor({ priceMinor: 1000 }), 1000);
  });

  it("sells for nothing at a discount of 0", () => {
    assert.equal(numberSellingMinor({ priceMinor: 1000, salePriceMinor: 0 }), 0);
  });
});

describe("changing a number's prices", () => {
  it("sets only the fields asked for", () => {
    assert.deepEqual(applyNumberPriceChange({ priceMinor: 1000, salePriceMinor: null }, { premiumMinor: 500 }), { set: { premiumMinor: 500 } });
  });

  it("refuses a discount at or above the price it ends with", () => {
    assert.deepEqual(applyNumberPriceChange({ priceMinor: 1000 }, { salePriceMinor: 1000 }), { problem: "discount" });
    assert.deepEqual(applyNumberPriceChange({ priceMinor: 1000 }, { priceMinor: 500, salePriceMinor: 600 }), { problem: "discount" });
    assert.deepEqual(applyNumberPriceChange({ priceMinor: 500 }, { priceMinor: 1000, salePriceMinor: 600 }), { set: { priceMinor: 1000, salePriceMinor: 600 } });
  });

  it("takes away a discount left unchanged that a lower price leaves at or above it", () => {
    assert.deepEqual(applyNumberPriceChange({ priceMinor: 1000, salePriceMinor: 800 }, { priceMinor: 700 }), { set: { priceMinor: 700, salePriceMinor: null } });
    assert.deepEqual(applyNumberPriceChange({ priceMinor: 1000, salePriceMinor: 800 }, { priceMinor: 900 }), { set: { priceMinor: 900 } });
  });

  it("takes the discount away when asked", () => {
    assert.deepEqual(applyNumberPriceChange({ priceMinor: 1000, salePriceMinor: 800 }, { salePriceMinor: null }), { set: { salePriceMinor: null } });
  });
});
