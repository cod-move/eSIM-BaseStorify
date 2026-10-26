import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LineAttributesError,
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
