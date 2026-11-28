import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanDayDiscounts, dayPayBp, daysPriceMinor, discountTiers, percentOff, shownDiscounts } from "../day-discount";

// eSIM Access UNLIMITED_PLAN_DISC as the API returned it on 2026-11-28 (tiers out of order).
const TIERS = cleanDayDiscounts([
  { minDays: 1, maxDays: 4, payBp: 9600 },
  { minDays: 10, maxDays: 19, payBp: 8900 },
  { minDays: 20, maxDays: 29, payBp: 8500 },
  { minDays: 30, maxDays: 365, payBp: 8200 },
  { minDays: 5, maxDays: 9, payBp: 9200 },
]);

describe("multi-day discounts", () => {
  it("sorts the tiers and drops broken ones", () => {
    assert.deepEqual(TIERS.map((tier) => tier.minDays), [1, 5, 10, 20, 30]);
    assert.deepEqual(cleanDayDiscounts([{ minDays: 3, maxDays: 2, payBp: 9000 }, { minDays: 1, maxDays: 2, payBp: 0 }, { minDays: 1, maxDays: 2 }]), []);
  });

  it("prices the days in the tier they fall in, in whole minor units", () => {
    assert.equal(dayPayBp(TIERS, 7), 9200);
    assert.equal(daysPriceMinor(90, 1, TIERS), 86); // 0.90 × 96% = 0.864
    assert.equal(daysPriceMinor(90, 7, TIERS), 580); // 6.30 × 92% = 5.796
    assert.equal(daysPriceMinor(90, 30, TIERS), 2214); // 27.00 × 82%
    assert.equal(daysPriceMinor(90, 400, TIERS), 36000); // beyond every tier: full price
    assert.equal(daysPriceMinor(90, 7), 630);
  });

  it("shows the tiers within the days on offer, as whole percent off", () => {
    assert.equal(percentOff(9600), 4);
    assert.deepEqual(shownDiscounts(TIERS, 1, 15).map((tier) => [tier.minDays, tier.maxDays]), [[1, 4], [5, 9], [10, 15]]);
    assert.deepEqual(discountTiers(TIERS, 1, 365).discounts?.at(-1), { minDays: 30, maxDays: 365, percentOff: 18 });
    assert.deepEqual(discountTiers([], 1, 365), {});
  });
});
