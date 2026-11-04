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
  networks: [{ countryCode: "JP", operator: "Docomo", network: "5G" }],
  breakoutIp: ["JP"],
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

  it("puts a pinned plan first and sells at its price, while it is on sale", () => {
    const plans = [
      { ...base, id: "cheap", retailPriceMinor: 499 },
      { ...base, id: "pinned", providerCode: "esimaccess", retailPriceMinor: 599 },
    ];
    const pins = new Map([["japan-esim", new Map([["total|5120|30", "pinned"]])]]);
    const [product] = planProducts(plans, pins);
    assert.deepEqual(product.variants[0].candidates, ["pinned", "cheap"]);
    assert.equal(product.variants[0].priceMinor, 599);
    const [unpinned] = planProducts([plans[0]], pins);
    assert.deepEqual(unpinned.variants[0].candidates, ["cheap"], "a pin on a plan no longer on sale is ignored");
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
    assert.match(perDay.key, /^unlimited\|0\|perday\|n:[0-9a-f]{8}\|ip:JP$/);
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

  it("keeps plans on other networks or with another exit IP apart, named so they can be told apart", () => {
    const [product] = planProducts([
      { ...base, id: "docomo", retailPriceMinor: 499 },
      { ...base, id: "docomo2", providerCode: "esimaccess", retailPriceMinor: 599, networks: [{ countryCode: "jp", operator: "Docomo ", network: "5g" }] },
      { ...base, id: "softbank", networks: [{ countryCode: "JP", operator: "SoftBank", network: "5G" }, { countryCode: "JP", operator: "KDDI", network: "4G" }] },
      { ...base, id: "hk-ip", breakoutIp: ["HK"] },
      { ...base, id: "no-ip", breakoutIp: [] },
      { ...base, id: "other", validityDays: 7 },
      { ...base, id: "docomo-4g", networks: [{ countryCode: "JP", operator: "Docomo", network: "4G" }], breakoutIp: ["SG"] },
      { ...base, id: "docomo-5g-sg", networks: [{ countryCode: "JP", operator: "Docomo", network: "5G" }, { countryCode: "JP", operator: "Docomo", network: "4G" }], breakoutIp: ["SG"] },
    ]);
    const byPrimary = new Map(product.variants.map((variant) => [variant.candidates[0], variant]));
    assert.deepEqual(byPrimary.get("docomo")!.candidates, ["docomo", "docomo2"], "the same networks and IP, written differently, are one variant");
    assert.equal(product.variants.length, 7);
    assert.equal(byPrimary.get("docomo-4g")!.name, "5GB / 30 days (Docomo 4G)", "the same operator on another generation is named with it");
    assert.equal(byPrimary.get("docomo-5g-sg")!.name, "5GB / 30 days (Docomo 5G)");
    assert.equal(byPrimary.get("softbank")!.name, "5GB / 30 days (KDDI, SoftBank)");
    assert.equal(byPrimary.get("hk-ip")!.name, "5GB / 30 days (IP HK)");
    assert.equal(byPrimary.get("no-ip")!.name, "5GB / 30 days (IP not stated)");
    assert.equal(byPrimary.get("other")!.name, "5GB / 7 days", "nothing else shares its data and days");
    assert.equal(byPrimary.get("other")!.distinction, null);
    assert.equal(new Set(product.variants.map((variant) => variant.name)).size, product.variants.length, "every name is unique");
    assert.equal(new Set(product.variants.map((variant) => variant.key)).size, product.variants.length);
  });

  it("groups by destination", () => {
    const products = planProducts([base, { ...base, id: "kr", productSlug: "south-korea-esim", destination: "South Korea" }]);
    assert.deepEqual(products.map((product) => product.productSlug).sort(), ["japan-esim", "south-korea-esim"]);
  });
});
