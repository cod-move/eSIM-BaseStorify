import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countryName, countryProductSlug, destinationKey, mergedSlug } from "@/lib/esim/catalog/destination-key";

const plan = (productSlug: string, destination: string, scope: string, codes: string[]) => ({
  productSlug,
  destination,
  coverage: { scope, countries: codes.map((code) => ({ code })) },
});

describe("which destination a plan is sold under", () => {
  it("files a single country under the country, whatever the supplier called it", () => {
    assert.deepEqual(destinationKey(plan("china-mainland-esim", "China mainland", "local", ["CN"])), { productSlug: "china-esim", destination: "China" });
    assert.deepEqual(destinationKey(plan("china-esim", "China", "local", ["CN"])), { productSlug: "china-esim", destination: "China" });
    assert.equal(destinationKey(plan("hong-kong-china-esim", "Hong Kong (China)", "local", ["HK"])).productSlug, "hong-kong-esim");
    assert.equal(destinationKey(plan("macao-china-esim", "Macao (China)", "local", ["MO"])).productSlug, "macao-esim");
  });

  it("keeps the names shoppers know", () => {
    assert.equal(countryProductSlug("US"), "united-states-esim");
    assert.equal(countryProductSlug("GB"), "united-kingdom-esim");
    assert.equal(countryProductSlug("KR"), "south-korea-esim");
    assert.equal(countryProductSlug("CZ"), "czech-republic-esim");
    assert.equal(countryProductSlug("TR"), "turkey-esim");
    assert.equal(countryName("KN"), "Saint Kitts and Nevis");
    assert.equal(countryName("ZZ"), null);
    assert.equal(countryName("china"), null);
  });

  it("leaves regions and the world as the supplier filed them", () => {
    assert.deepEqual(destinationKey(plan("china-mainland-hk-macao-esim", "China (mainland HK Macao)", "regional", ["CN", "HK", "MO"])), {
      productSlug: "china-mainland-hk-macao-esim",
      destination: "China (mainland HK Macao)",
    });
    assert.equal(destinationKey(plan("global-esim", "Global", "global", ["US", "FR"])).productSlug, "global-esim");
    // A "local" plan listing several countries is not one country.
    assert.equal(destinationKey(plan("odd-esim", "Odd", "local", ["CN", "HK"])).productSlug, "odd-esim");
  });

  it("applies an admin's merges, through chains, and stops at a loop", () => {
    const merges = new Map([["greater-china-esim", "china-esim"]]);
    assert.equal(destinationKey(plan("greater-china-esim", "Greater China", "regional", ["CN", "HK", "MO", "TW"]), merges).productSlug, "china-esim");
    assert.equal(mergedSlug("a", new Map([["a", "b"], ["b", "c"]])), "c");
    assert.equal(mergedSlug("a", new Map([["a", "b"], ["b", "a"]])), "b");
    assert.equal(mergedSlug("x", new Map([["a", "b"]])), "x");
  });

  it("files by the supplier's own slug when the plan was filed before", () => {
    const merges = new Map([["greater-china-esim", "china-esim"]]);
    const stored = { ...plan("china-esim", "Greater China", "regional", ["CN", "HK"]), supplierProductSlug: "greater-china-esim" };
    assert.equal(destinationKey(stored, merges).productSlug, "china-esim");
    assert.equal(destinationKey(stored).productSlug, "greater-china-esim");
  });
});
