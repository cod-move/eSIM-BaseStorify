import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TopupError, forDays } from "../days";
import type { ProviderTopupPlan } from "../../providers/types";

const dayPass: ProviderTopupPlan = {
  topupPlanId: "TOPUP_P9LD7ZDVR",
  name: "China 1GB/Day",
  megabytes: 1024,
  validityDays: 1,
  cost: { currency: "USD", amountMinor: 96 },
  perDay: { minDays: 1, maxDays: 365, defaultDays: 1 },
  raw: {},
};

describe("a top-up taken for some days", () => {
  it("is the supplier's id for those days, at the price per day times them", () => {
    const week = forDays(dayPass, 7);
    assert.equal(week.topupPlanId, "TOPUP_P9LD7ZDVR|7");
    assert.equal(week.validityDays, 7);
    assert.equal(week.cost.amountMinor, 672);
    assert.equal(week.name, "China 1GB/Day × 7 days");
    assert.equal(week.perDay, null);
  });

  it("takes the multi-day discount off the cost for those days", () => {
    const discounted = { ...dayPass, perDay: { ...dayPass.perDay!, discounts: [{ minDays: 5, maxDays: 9, payBp: 9200 }] } };
    assert.equal(forDays(discounted, 7).cost.amountMinor, 618); // 6.72 × 92% = 6.1824
    assert.equal(forDays(discounted, 4).cost.amountMinor, 384);
  });

  it("takes the default days when none is asked (an app from before the stepper)", () => {
    assert.equal(forDays(dayPass).topupPlanId, "TOPUP_P9LD7ZDVR|1");
  });

  it("refuses days outside the range", () => {
    assert.throws(() => forDays(dayPass, 0), TopupError);
    assert.throws(() => forDays(dayPass, 366), TopupError);
    assert.throws(() => forDays(dayPass, 2.5), TopupError);
  });

  it("leaves any other top-up as listed", () => {
    const fixed = { ...dayPass, perDay: null };
    assert.equal(forDays(fixed, 7), fixed);
  });
});
