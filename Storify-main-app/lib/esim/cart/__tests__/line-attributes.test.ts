import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LineAttributesError,
  activationDateBounds,
  lineActivationDate,
  lineDays,
  linePriceMinor,
  lineVariantName,
  parseLineAttributes,
  resolveLineAttributes,
  withLineDays,
} from "../line-attributes";

const perDay = { priceMinor: 299, minDays: 1, maxDays: 30, defaultDays: 3 };

describe("parseLineAttributes", () => {
  it("treats nothing as no attributes", () => {
    assert.equal(parseLineAttributes(undefined), null);
    assert.equal(parseLineAttributes({}), null);
    assert.equal(parseLineAttributes({ days: null }), null);
  });

  it("accepts whole days only", () => {
    assert.deepEqual(parseLineAttributes({ days: 7 }), { days: 7 });
    assert.throws(() => parseLineAttributes({ days: 2.5 }), LineAttributesError);
    assert.throws(() => parseLineAttributes({ days: "7" }), LineAttributesError);
    assert.throws(() => parseLineAttributes({ days: 0 }), LineAttributesError);
  });

  it("refuses keys it does not know", () => {
    assert.throws(() => parseLineAttributes({ activationDate: "2026-11-01" }), /Unknown line option "activationDate"/);
    assert.throws(() => parseLineAttributes([1]), LineAttributesError);
  });
});

describe("resolveLineAttributes", () => {
  it("defaults the days of a day-priced variant", () => {
    assert.deepEqual(resolveLineAttributes(null, perDay), { days: 3 });
    assert.deepEqual(resolveLineAttributes({ days: 30 }, perDay), { days: 30 });
  });

  it("refuses days outside the range", () => {
    assert.throws(() => resolveLineAttributes({ days: 31 }, perDay), /between 1 and 30/);
  });

  it("refuses days on a variant that takes none", () => {
    assert.equal(resolveLineAttributes(null, null), null);
    assert.throws(() => resolveLineAttributes({ days: 3 }, null), LineAttributesError);
  });
});

describe("pricing and naming a line", () => {
  it("clamps stored days to the range as it stands", () => {
    assert.equal(lineDays({ days: 7 }, perDay), 7);
    assert.equal(lineDays({ days: 90 }, perDay), 30);
    assert.equal(lineDays(undefined, perDay), 3);
    assert.equal(lineDays({ days: "x" }, perDay), 3);
  });

  it("prices per day", () => {
    assert.equal(linePriceMinor(perDay, 7), 2093);
  });

  it("names the days in place of the range", () => {
    assert.equal(lineVariantName("Unlimited / 1–365 days", 7), "Unlimited / 7 days");
    assert.equal(lineVariantName("Unlimited (3GB/day high speed) / 1–30 days", 1), "Unlimited (3GB/day high speed) / 1 day");
  });

  it("rewrites an order line's frozen variant only when the line carries days", () => {
    const snapshot = {
      variantLabel: "Unlimited / 1–365 days",
      variantOptions: [
        { name: "Data", value: "Unlimited" },
        { name: "Validity", value: "1–365 days" },
      ],
      variantSku: "ESIM-X",
    };
    assert.deepEqual(withLineDays({ lineAttributes: { days: 10 } }, snapshot), {
      variantLabel: "Unlimited / 10 days",
      variantOptions: [
        { name: "Data", value: "Unlimited" },
        { name: "Validity", value: "10 days" },
      ],
      variantSku: "ESIM-X",
    });
    assert.equal(withLineDays({}, snapshot), snapshot);
    assert.deepEqual(withLineDays({ lineAttributes: { days: 2 } }, {}), {});
  });
});

describe("start date (ORD-03)", () => {
  const now = new Date("2026-10-29T15:00:00Z");

  it("takes a real calendar day only", () => {
    assert.deepEqual(parseLineAttributes({ activateOn: "2026-11-10" }), { activateOn: "2026-11-10" });
    assert.throws(() => parseLineAttributes({ activateOn: "2026-02-30" }), /start date/);
    assert.throws(() => parseLineAttributes({ activateOn: "10/11/2026" }), /start date/);
    assert.throws(() => parseLineAttributes({ activateOn: "2026-11-10", topup: "a".repeat(24) }), /top-up takes no start date/);
    assert.throws(() => parseLineAttributes({ activateOn: "2026-11-10", wallet: 500 }), /wallet top-up/);
  });

  it("is from tomorrow up to 180 days ahead", () => {
    assert.deepEqual(activationDateBounds(now), { min: "2026-10-30", max: "2027-04-27" });
  });

  it("goes only with a variant whose suppliers schedule, inside the window", () => {
    assert.deepEqual(resolveLineAttributes({ activateOn: "2026-11-10" }, null, { scheduled: true, now }), { activateOn: "2026-11-10" });
    assert.deepEqual(resolveLineAttributes({ activateOn: "2026-11-10", days: 7 }, perDay, { scheduled: true, now }), { days: 7, activateOn: "2026-11-10" });
    assert.throws(() => resolveLineAttributes({ activateOn: "2026-11-10" }, null, { now }), /cannot be given a start date/);
    assert.throws(() => resolveLineAttributes({ activateOn: "2026-10-29" }, null, { scheduled: true, now }), /between 2026-10-30/);
    assert.throws(() => resolveLineAttributes({ activateOn: "2027-06-01" }, null, { scheduled: true, now }), /and 2027-04-27/);
  });

  it("reads back from a stored line and names it on the order", () => {
    assert.equal(lineActivationDate({ activateOn: "2026-11-10" }), "2026-11-10");
    assert.equal(lineActivationDate({ activateOn: "soon" }), null);
    assert.equal(lineActivationDate(undefined), null);
    assert.equal(
      withLineDays({ lineAttributes: { days: 7, activateOn: "2026-11-10" } }, { variantLabel: "Unlimited / 1–30 days" }).variantLabel,
      "Unlimited / 7 days · starts 2026-11-10",
    );
    assert.equal(withLineDays({ lineAttributes: { activateOn: "2026-11-10" } }, { variantLabel: "5GB / 30 days" }).variantLabel, "5GB / 30 days · starts 2026-11-10");
  });
});
