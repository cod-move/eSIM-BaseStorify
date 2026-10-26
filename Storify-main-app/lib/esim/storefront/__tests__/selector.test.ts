import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { continentOf, flagEmoji } from "../continents";
import { FLEX_DAYS, fromPriceMinor, resolveSelection, type StorefrontVariant } from "../selector";

const v = (id: string, over: Partial<StorefrontVariant>): StorefrontVariant => ({
  variantId: id,
  name: id,
  priceMinor: 500,
  dataType: "total",
  megabytes: 1024,
  dataValue: "1GB",
  days: 7,
  perDay: null,
  topupMode: "none",
  breakoutIp: ["JP"],
  ...over,
});

const variants = [
  v("1gb-7", {}),
  v("5gb-7", { megabytes: 5120, dataValue: "5GB", priceMinor: 1200 }),
  v("5gb-30", { megabytes: 5120, dataValue: "5GB", days: 30, priceMinor: 1500, topupMode: "stack" }),
  v("5gb-30-hk", { megabytes: 5120, dataValue: "5GB", days: 30, priceMinor: 1400, topupMode: "stack", breakoutIp: ["HK"] }),
  v("unl-flex", {
    dataType: "unlimited",
    megabytes: 0,
    dataValue: "Unlimited",
    days: null,
    perDay: { priceMinor: 299, minDays: 1, maxDays: 30, defaultDays: 3 },
    priceMinor: 299,
  }),
];

describe("resolveSelection", () => {
  it("offers days first, fixed ones in order and the pick-your-days option last", () => {
    const selection = resolveSelection(variants);
    assert.deepEqual(selection.days.map((option) => option.value), ["7", "30", FLEX_DAYS]);
    assert.equal(selection.days[0].fromPriceMinor, 500);
    assert.equal(selection.variant?.variantId, "1gb-7");
  });

  it("narrows each later step to what the earlier ones leave", () => {
    const selection = resolveSelection(variants, { days: "30" });
    assert.deepEqual(selection.data.map((option) => option.value), ["5GB"]);
    assert.deepEqual(selection.topup.map((option) => option.value), ["stack"]);
    assert.deepEqual(selection.breakout.map((option) => option.value), ["HK", "JP"]);
    assert.equal(selection.variant?.variantId, "5gb-30-hk");
    assert.equal(resolveSelection(variants, { days: "30", breakout: "JP" }).variant?.variantId, "5gb-30");
  });

  it("falls back when a later choice is no longer possible", () => {
    const selection = resolveSelection(variants, { days: "7", data: "Unlimited", breakout: "HK" });
    assert.equal(selection.choice.data, "1GB");
    assert.equal(selection.choice.breakout, "JP");
    assert.equal(selection.variant?.variantId, "1gb-7");
  });

  it("lists data as the catalogue does: total allowances first, then daily, then unlimited", () => {
    const mixed = [
      v("daily", { dataType: "daily_cutoff", dataValue: "500MB/day", megabytes: 500, priceMinor: 300 }),
      v("unl", { dataType: "unlimited", dataValue: "Unlimited", megabytes: 0 }),
      v("3gb", { megabytes: 3072, dataValue: "3GB" }),
    ];
    assert.deepEqual(resolveSelection(mixed).data.map((option) => option.value), ["3GB", "500MB/day", "Unlimited"]);
  });

  it("selects the day-priced variant", () => {
    assert.equal(resolveSelection(variants, { days: FLEX_DAYS }).variant?.variantId, "unl-flex");
  });

  it("has nothing to select from nothing", () => {
    const selection = resolveSelection([]);
    assert.equal(selection.variant, null);
    assert.deepEqual(selection.days, []);
  });

  it("starts the destination's price at its cheapest buy", () => {
    assert.equal(fromPriceMinor(variants), 299);
    assert.equal(fromPriceMinor([variants[1]]), 1200);
    assert.equal(fromPriceMinor([]), null);
  });
});

describe("continents", () => {
  it("files countries the way travellers look for them", () => {
    assert.equal(continentOf("JP"), "asia");
    assert.equal(continentOf("tr"), "europe");
    assert.equal(continentOf("AE"), "middle_east");
    assert.equal(continentOf("MX"), "north_america");
    assert.equal(continentOf("ZZ"), "other");
    assert.equal(continentOf(null), "other");
  });

  it("draws flags from country codes", () => {
    assert.equal(flagEmoji("JP"), "🇯🇵");
    assert.equal(flagEmoji("gb"), "🇬🇧");
    assert.equal(flagEmoji("EUR"), "");
  });
});
