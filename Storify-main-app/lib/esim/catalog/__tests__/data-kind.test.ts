import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shopperDataType } from "../data-kind";

describe("shopper data type", () => {
  it("shows a day-pass slowed to 512 kbps or more as unlimited", () => {
    assert.equal(shopperDataType("daily_throttled", { reducedSpeedMbps: 1 }), "unlimited");
    assert.equal(shopperDataType("daily_throttled", { reducedSpeedMbps: 0.512 }), "unlimited");
  });

  it("keeps a slower or unstated day-pass as a daily allowance", () => {
    assert.equal(shopperDataType("daily_throttled", { reducedSpeedMbps: 0.128 }), "daily_throttled");
    assert.equal(shopperDataType("daily_throttled", { reducedSpeedMbps: null }), "daily_throttled");
    assert.equal(shopperDataType("daily_throttled", null), "daily_throttled");
  });

  it("follows the admin's threshold", () => {
    assert.equal(shopperDataType("daily_throttled", { reducedSpeedMbps: 0.128 }, 128), "unlimited");
    assert.equal(shopperDataType("daily_throttled", { reducedSpeedMbps: 1 }, 2000), "daily_throttled");
  });

  it("leaves every other type alone", () => {
    for (const type of ["total", "unlimited", "daily_cutoff", "lifetime"] as const) {
      assert.equal(shopperDataType(type, { reducedSpeedMbps: 10 }), type);
    }
  });
});
