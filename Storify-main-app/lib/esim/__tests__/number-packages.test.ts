import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSupplierPackets, packagePricingInput, packetFields } from "../numbers/packages";
import { priceOf } from "../pricing/price";
import type { TopConnectDataPackage } from "../providers/topconnect";

const packet = (code: string, priceMinor: number | null, extra: Partial<TopConnectDataPackage> = {}): TopConnectDataPackage => ({
  code,
  name: `Packet ${code}`,
  volumeBytes: 5000 * 1_024_000,
  durationHours: 168,
  priceMinor,
  currency: "EUR",
  ...extra,
});

describe("number data packages", () => {
  it("reads a getdiscount entry: TopConnect megabytes, unlimited, currency fallback", () => {
    assert.deepEqual(packetFields(packet("814", 800), "USD"), {
      packetId: "814",
      name: "Packet 814",
      validityDays: 7,
      volumeMb: 5000,
      cost: { amountMinor: 800, currency: "EUR" },
    });
    assert.equal(packetFields(packet("818", 300, { volumeBytes: 0 }), "EUR")!.volumeMb, null);
    assert.equal(packetFields(packet("1", 99, { currency: null }), "eur")!.cost.currency, "EUR");
    assert.equal(packetFields(packet("x1", 99), "EUR"), null);
    assert.equal(packetFields(packet("2", null), "EUR"), null);
  });

  it("folds TopConnect's list into the stored one", () => {
    const stored = [
      { id: "a", packetId: "814", cost: { amountMinor: 800, currency: "EUR" }, validityDays: 7, volumeMb: 5000 },
      { id: "b", packetId: "815", cost: { amountMinor: 1200, currency: "EUR" }, validityDays: 10, volumeMb: 10000 },
      { id: "c", packetId: "999", cost: { amountMinor: 100, currency: "EUR" }, validityDays: 1, volumeMb: 100 },
    ];
    const merge = mergeSupplierPackets(
      stored,
      [packet("814", 800), packet("815", 1300, { volumeBytes: 10000 * 1_024_000, durationHours: 240 }), packet("816", 3000), packet("816", 3000), packet("", 1)],
      "EUR",
    );
    assert.deepEqual(merge.create.map((fields) => fields.packetId), ["816"]);
    assert.deepEqual(merge.update, [
      {
        id: "b",
        packetId: "815",
        set: { cost: { amountMinor: 1300, currency: "EUR" }, validityDays: 10, volumeMb: 10000 },
        before: { cost: { amountMinor: 1200, currency: "EUR" }, validityDays: 10, volumeMb: 10000 },
      },
    ]);
    assert.equal(merge.unchanged, 1);
    assert.equal(merge.skipped, 1);
  });

  it("prices a packet like a plan: one country is local, several regional", () => {
    const settings = { fxBufferPercent: 2, defaultMarkupPercent: 30, minMarginPercent: 10, rounding: "none" as const };
    const rules = [
      { id: "fr", providerCode: null, countryCode: "FR", scope: "local" as const, markupPercent: 50, fixedMarkupMinor: 0, priority: 0 },
      { id: "tc", providerCode: "topconnect", countryCode: null, scope: null, markupPercent: 0, fixedMarkupMinor: 0, priority: 0 },
    ];
    const local = priceOf(packagePricingInput({ countryCodes: ["FR"], cost: { amountMinor: 1000, currency: "EUR" } }, 1.1), rules, settings);
    assert.equal(local.ruleId, "fr");
    assert.equal(local.retailMinor, 1683); // 1000 × 1.1 × 1.02 × 1.5
    const regional = priceOf(packagePricingInput({ countryCodes: ["FR", "DE"], cost: { amountMinor: 1000, currency: "EUR" } }, 1.1), rules, settings);
    assert.equal(regional.ruleId, "tc");
    assert.equal(regional.marginFloorApplied, true); // 0 % markup, the 10 % floor wins
    assert.equal(regional.retailMinor, 1235);
    assert.equal(packagePricingInput({ countryCodes: [], cost: { amountMinor: 1, currency: "EUR" } }, 1).scope, "global");
  });
});

describe("TopConnect package validity", () => {
  it("counts TopConnect's hours as days, a part day as a day", () => {
    const fields = (hours: number | null) => packetFields({ code: "1", name: "x", volumeBytes: null, durationHours: hours, priceMinor: 100, currency: "EUR" }, "EUR")?.validityDays;
    assert.equal(fields(744), 31);
    assert.equal(fields(24), 1);
    assert.equal(fields(1), 1);
    assert.equal(fields(25), 2);
    assert.equal(fields(0), 0);
    assert.equal(fields(null), 0);
  });
});
