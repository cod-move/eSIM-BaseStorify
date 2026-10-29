import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comparisonRows, coverageByCountry, searchCountries } from "../compare";
import type { StorefrontVariant } from "../selector";

const variant = (overrides: Partial<StorefrontVariant>): StorefrontVariant => ({
  variantId: "v",
  name: "plan",
  priceMinor: 1000,
  dataType: "total",
  megabytes: 1024,
  dataValue: "1GB",
  days: 7,
  perDay: null,
  topupMode: "none",
  breakoutIp: [],
  ...overrides,
});

describe("comparisonRows", () => {
  it("orders by days then data, and marks the cheapest per GB", () => {
    const rows = comparisonRows([
      variant({ variantId: "b", days: 30, megabytes: 10240, priceMinor: 3000 }),
      variant({ variantId: "a", days: 7, megabytes: 3072, priceMinor: 1200 }),
      variant({ variantId: "c", days: 7, megabytes: 1024, priceMinor: 500 }),
      variant({ variantId: "u", days: 7, dataType: "unlimited", megabytes: 2048, priceMinor: 1500 }),
    ]);
    assert.deepEqual(rows.map((row) => row.variant.variantId), ["c", "a", "u", "b"]);
    assert.deepEqual(rows.map((row) => row.perGbMinor), [500, 400, null, 300]);
    assert.deepEqual(rows.filter((row) => row.bestPerGb).map((row) => row.variant.variantId), ["b"]);
    assert.equal(rows[0].perDayMinor, 71);
  });

  it("prices a day-priced plan for its fewest days", () => {
    const [row] = comparisonRows([
      variant({ days: null, perDay: { priceMinor: 150, minDays: 3, maxDays: 30, defaultDays: 7 }, megabytes: 1024, dataType: "daily_cutoff" }),
    ]);
    assert.equal(row.priceMinor, 450);
    assert.equal(row.perDayMinor, 150);
    assert.equal(row.perGbMinor, null);
    assert.equal(row.bestPerGb, false, "nothing to compare against");
  });
});

describe("coverageByCountry", () => {
  const countries = [
    { code: "FR", name: "France" },
    { code: "AT", name: "Österreich" },
    { code: "DE", name: "Germany" },
  ];
  const networks = [
    { countryCode: "FR", operator: "Orange", network: "4G" },
    { countryCode: "FR", operator: "Orange", network: "5G" },
    { countryCode: "FR", operator: "SFR", network: null },
    { countryCode: "fr", operator: "Bouygues", network: "5G" },
    { countryCode: "AT", operator: "A1", network: "4G" },
  ];

  it("groups operators under their country, fastest first", () => {
    const list = coverageByCountry(countries, networks, "en");
    assert.deepEqual(list.map((country) => country.code), ["FR", "DE", "AT"]);
    assert.deepEqual(list[0].operators, [
      { operator: "Bouygues", network: "5G" },
      { operator: "Orange", network: "5G" },
      { operator: "SFR", network: null },
    ]);
    assert.deepEqual(list[1].operators, []);
  });

  it("finds countries by name without accents, by code and by operator", () => {
    const list = coverageByCountry(countries, networks, "en");
    assert.deepEqual(searchCountries(list, "oster").map((country) => country.code), ["AT"]);
    assert.deepEqual(searchCountries(list, "de").map((country) => country.code), ["DE"]);
    assert.deepEqual(searchCountries(list, "orange").map((country) => country.code), ["FR"]);
    assert.equal(searchCountries(list, "  ").length, 3);
  });
});
