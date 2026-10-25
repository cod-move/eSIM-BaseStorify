import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planProducts, type VariantPlan } from "../variants";

const base: VariantPlan = {
  id: "p",
  providerCode: "stellar",
  providerPriority: 10,
  productSlug: "japan-esim",
  destination: "Japan",
  dataType: "total",
  megabytes: 5120,
  dataLabel: "5GB",
  validityDays: 30,
  dayPriced: false,
  minDays: 30,
  maxDays: 30,
  defaultDays: 30,
  retailPriceMinor: 999,
  costUsdMinor: 500,
  highSpeedGbPerDay: null,
};

describe("planProducts", () => {
  it("merges the same plan from two suppliers into one variant, primary by price, then cost, then priority", () => {
    const [product] = planProducts([
      { ...base, id: "esa", providerCode: "esimaccess", providerPriority: 20, retailPriceMinor: 499, costUsdMinor: 300 },
      { ...base, id: "stl", providerCode: "stellar", providerPriority: 10, retailPriceMinor: 999, costUsdMinor: 600 },
      { ...base, id: "esa2", providerCode: "esimaccess", providerPriority: 20, retailPriceMinor: 499, costUsdMinor: 250 },
      { ...base, id: "stl2", providerCode: "stellar", providerPriority: 10, retailPriceMinor: 499, costUsdMinor: 250 },
    ]);
    assert.equal(product.variants.length, 1);
    assert.deepEqual(product.variants[0].candidates, ["stl2", "esa2", "esa", "stl"]);
    assert.equal(product.variants[0].priceMinor, 499);
    assert.equal(product.variants[0].name, "5GB / 30 days");
  });

  it("orders variants by type, allowance, then days", () => {
    const [product] = planProducts([
      { ...base, id: "a", megabytes: 10240, dataLabel: "10GB" },
      { ...base, id: "b", megabytes: 1024, dataLabel: "1GB", validityDays: 7 },
      { ...base, id: "c", dataType: "unlimited", megabytes: 0, dataLabel: "", validityDays: 7, highSpeedGbPerDay: 3 },
      { ...base, id: "d", megabytes: 1024, dataLabel: "1GB", validityDays: 1 },
    ]);
    assert.deepEqual(
      product.variants.map((variant) => variant.name),
      ["1GB / 1 day", "1GB / 7 days", "10GB / 30 days", "Unlimited (3GB/day high speed) / 7 days"],
    );
  });

  it("makes a day-priced plan one variant priced per day, sold from its fewest days", () => {
    const daily = {
      ...base,
      dataType: "unlimited" as const,
      megabytes: 0,
      dataLabel: "",
      validityDays: 1,
      dayPriced: true,
      minDays: 1,
      maxDays: 365,
      defaultDays: 1,
      retailPriceMinor: 299,
      costUsdMinor: 140,
    };
    const [product] = planProducts([
      { ...base, id: "fixed", dataType: "unlimited", megabytes: 0, dataLabel: "", validityDays: 7 },
      { ...daily, id: "stl" },
      { ...daily, id: "cheap", retailPriceMinor: 249, minDays: 2, maxDays: 30, defaultDays: 3 },
    ]);
    assert.deepEqual(product.variants.map((variant) => variant.name), ["Unlimited / 7 days", "Unlimited / 2–30 days"]);
    const perDay = product.variants[1];
    assert.equal(perDay.key, "unlimited|0|perday");
    assert.deepEqual(perDay.perDay, { priceMinor: 249, minDays: 2, maxDays: 30, defaultDays: 3 });
    assert.equal(perDay.priceMinor, 498);
    assert.deepEqual(perDay.candidates, ["cheap", "stl"]);
    assert.equal(product.variants[0].perDay, null);
  });

  it("skips a day-priced plan with no valid range", () => {
    assert.equal(planProducts([{ ...base, dayPriced: true, minDays: 5, maxDays: 2 }]).length, 0);
  });

  it("merges bundles that would read the same to the shopper", () => {
    const [product] = planProducts([
      { ...base, id: "a", megabytes: 1024, dataLabel: "1GB", validityDays: 7 },
      { ...base, id: "b", megabytes: 1000, dataLabel: "1GB", validityDays: 7, retailPriceMinor: 899 },
    ]);
    assert.equal(product.variants.length, 1);
    assert.deepEqual(product.variants[0].candidates, ["b", "a"]);
  });

  it("groups by destination", () => {
    const products = planProducts([base, { ...base, id: "kr", productSlug: "south-korea-esim", destination: "South Korea" }]);
    assert.deepEqual(products.map((product) => product.productSlug).sort(), ["japan-esim", "south-korea-esim"]);
  });
});
