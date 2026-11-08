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

  it("files several countries by the countries, not the name", () => {
    assert.deepEqual(destinationKey(plan("china-mainland-hk-macao-esim", "China (mainland HK Macao)", "regional", ["CN", "HK", "MO"])), {
      productSlug: "china-hong-kong-macao-esim",
      destination: "China + Hong Kong + Macao",
    });
    assert.equal(destinationKey(plan("greater-china", "Greater China", "regional", ["MO", "hk", "CN"])).productSlug, "china-hong-kong-macao-esim");
    const eu = ["FR", "DE", "IT", "ES", "NL"];
    assert.deepEqual(destinationKey(plan("eu-5", "EU 5", "regional", eu)), { productSlug: "europe-5-esim", destination: "Europe (5 countries)" });
    assert.equal(destinationKey(plan("x", "Europe+", "regional", [...eu, "EG"])).productSlug, "europe-6-esim");
    assert.equal(destinationKey(plan("eu-6", "EU 6", "regional", [...eu, "PT"])).productSlug, "europe-6-esim");
    // Mixed regions keep the supplier's slug.
    assert.equal(destinationKey(plan("mix-esim", "Mix", "regional", ["FR", "DE", "JP", "KR", "US"])).productSlug, "mix-esim");
    assert.deepEqual(destinationKey(plan("global-esim", "Global", "global", ["US", "FR"])), { productSlug: "global-2-esim", destination: "Global (2 countries)" });
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
    assert.equal(destinationKey(stored).productSlug, "china-hong-kong-esim");
  });
});
