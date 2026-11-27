import test from "node:test";
import assert from "node:assert/strict";
import { canonicalCountry } from "../country";
test("country names in the shopper's language", () => {
  assert.equal(canonicalCountry("中国"), "China");
  assert.equal(canonicalCountry("美國"), "United States");
  assert.equal(canonicalCountry("Deutschland"), "Germany");
  assert.equal(canonicalCountry("日本"), "Japan");
  assert.equal(canonicalCountry("CN"), "CN");
  assert.equal(canonicalCountry("China"), "China");
  assert.equal(canonicalCountry("Nowhere"), "Nowhere");
});
