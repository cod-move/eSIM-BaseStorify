import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEcbDaily, usdPerUnit } from "../fx";
import { matchRule, priceOf, roundUp, type PricingRule, type PricingSettings } from "../price";

const ECB_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube><Cube time='2026-10-23'>
    <Cube currency='USD' rate='1.0800'/>
    <Cube currency='JPY' rate='162.00'/>
    <Cube currency='GBP' rate='0.8400'/>
  </Cube></Cube>
</gesmes:Envelope>`;

describe("ECB rates", () => {
  it("parses the daily feed and crosses it through USD", () => {
    const rates = parseEcbDaily(ECB_SAMPLE);
    assert.equal(rates.date, "2026-10-23");
    const perUnit = usdPerUnit(rates);
    assert.equal(perUnit.USD, 1);
    assert.equal(perUnit.EUR, 1.08);
    assert.ok(Math.abs(perUnit.JPY - 1.08 / 162) < 1e-12);
  });

  it("refuses a feed without USD", () => {
    assert.throws(() => parseEcbDaily("<Cube time='2026-10-23'><Cube currency='JPY' rate='1'/></Cube>"), /no USD/);
  });
});

describe("rounding", () => {
  it("rounds up to the ending, never down", () => {
    assert.equal(roundUp(433, "99"), 499);
    assert.equal(roundUp(399, "99"), 399);
    assert.equal(roundUp(400, "99"), 499);
    assert.equal(roundUp(433, "49_99"), 449);
    assert.equal(roundUp(450, "49_99"), 499);
    assert.equal(roundUp(433.2, "none"), 434);
  });
});

const settings: PricingSettings = {
  fxBufferPercent: 3,
  defaultMarkupPercent: 50,
  minMarginPercent: 15,
  rounding: "99",
};

const rule = (overrides: Partial<PricingRule>): PricingRule => ({
  id: "r",
  providerCode: null,
  countryCode: null,
  scope: null,
  markupPercent: 40,
  fixedMarkupMinor: 0,
  priority: 0,
  ...overrides,
});

const japan = { providerCode: "esimaccess", scope: "local" as const, countryCodes: ["JP"], costMinor: 250, usdPerUnit: 1 };

describe("rule matching", () => {
  it("prefers the most specific rule", () => {
    const rules = [
      rule({ id: "any" }),
      rule({ id: "provider", providerCode: "esimaccess" }),
      rule({ id: "provider+country", providerCode: "esimaccess", countryCode: "JP" }),
      rule({ id: "country", countryCode: "JP" }),
    ];
    assert.equal(matchRule(rules, japan)?.id, "provider+country");
  });

  it("does not apply a country rule to a regional plan covering that country", () => {
    const rules = [rule({ id: "jp", countryCode: "JP" }), rule({ id: "regional", scope: "regional" })];
    assert.equal(matchRule(rules, { ...japan, scope: "regional", countryCodes: ["JP", "KR"] })?.id, "regional");
  });

  it("breaks ties by priority", () => {
    const rules = [rule({ id: "low", countryCode: "JP", priority: 1 }), rule({ id: "high", countryCode: "JP", priority: 5 })];
    assert.equal(matchRule(rules, japan)?.id, "high");
  });
});

describe("price", () => {
  it("converts, buffers, marks up and rounds", () => {
    // 2.50 EUR at 1.08 → 2.70 USD, +3% → 2.781, +50% → 4.1715 → 4.99
    const result = priceOf({ ...japan, usdPerUnit: 1.08 }, [], settings);
    assert.equal(result.costUsdMinor, 278);
    assert.equal(result.retailMinor, 499);
    assert.equal(result.ruleId, null);
    assert.equal(result.markupPercent, 50);
  });

  it("applies a matching rule's markup and fixed amount", () => {
    const result = priceOf(japan, [rule({ id: "jp", countryCode: "JP", markupPercent: 20, fixedMarkupMinor: 100 })], settings);
    // 250 × 1.03 = 257.5 → ×1.2 = 309 + 100 = 409 → 4.99
    assert.equal(result.retailMinor, 499);
    assert.equal(result.ruleId, "jp");
  });

  it("never sells under the minimum margin", () => {
    const result = priceOf(japan, [rule({ countryCode: "JP", markupPercent: 0 })], { ...settings, rounding: "none" });
    // floor = 257.5 × 1.15 = 296.125 → 297
    assert.equal(result.retailMinor, 297);
    assert.equal(result.marginFloorApplied, true);
  });

  it("refuses a missing exchange rate", () => {
    assert.throws(() => priceOf({ ...japan, usdPerUnit: 0 }, [], settings), /exchange rate/);
  });
});
