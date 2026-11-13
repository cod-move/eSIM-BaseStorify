import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopeModeOf, scopeValueOf } from "../coupon-scope-mode";

const options = { numberProductId: "num", esimCategoryId: "cat", destinationProductIds: ["jp", "eu", "th"] };
const value = (applicableProducts: string[], applicableCategories: string[] = []) => ({ applicableProducts, applicableCategories });

describe("coupon scope", () => {
  it("reads the mode from the coupon's fields", () => {
    assert.equal(scopeModeOf(value([]), options), "all");
    assert.equal(scopeModeOf(value(["num"]), options), "numbers");
    assert.equal(scopeModeOf(value([], ["cat"]), options), "travel");
    assert.equal(scopeModeOf(value(["jp", "th"]), options), "destinations");
    assert.equal(scopeModeOf(value(["jp", "shoes"]), options), "custom");
    assert.equal(scopeModeOf(value([], ["clothes"]), options), "custom");
    assert.equal(scopeModeOf(value(["num", "jp"]), options), "custom");
  });

  it("writes each mode's fields, and round-trips", () => {
    assert.deepEqual(scopeValueOf("all", options), value([]));
    assert.deepEqual(scopeValueOf("numbers", options), value(["num"]));
    assert.deepEqual(scopeValueOf("travel", options), value([], ["cat"]));
    assert.deepEqual(scopeValueOf("destinations", options, ["jp", "jp", "eu"]), value(["jp", "eu"]));
    for (const mode of ["all", "numbers", "travel"] as const) {
      assert.equal(scopeModeOf(scopeValueOf(mode, options)!, options), mode);
    }
  });

  it("cannot point at what the store has not got", () => {
    const bare = { numberProductId: null, esimCategoryId: null, destinationProductIds: [] };
    assert.equal(scopeValueOf("numbers", bare), null);
    assert.equal(scopeValueOf("travel", bare), null);
  });
});
