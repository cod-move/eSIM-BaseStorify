import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { destinationFlag, emojiFlagCode, flagSrc } from "../flags";

describe("flags", () => {
  it("points at a country's file, whatever the case", () => {
    assert.equal(flagSrc("jp"), "/esim/flags/JP.svg");
    assert.equal(flagSrc("EU"), "/esim/flags/EU.svg");
    assert.equal(flagSrc("ZZ"), null);
    assert.equal(flagSrc(null), null);
  });

  it("reads the country of an emoji flag only", () => {
    assert.equal(emojiFlagCode("🇪🇺"), "EU");
    assert.equal(emojiFlagCode(" 🇯🇵 "), "JP");
    assert.equal(emojiFlagCode("🌍"), null);
    assert.equal(emojiFlagCode("EU"), null);
    assert.equal(emojiFlagCode(null), null);
  });

  it("gives a country its flag and a region the flag its emoji names", () => {
    assert.equal(destinationFlag({ scope: "local", countryCodes: ["TH"], emoji: null }), "/esim/flags/TH.svg");
    assert.equal(destinationFlag({ scope: "regional", countryCodes: ["FR", "DE"], emoji: "🇪🇺" }), "/esim/flags/EU.svg");
    assert.equal(destinationFlag({ scope: "regional", countryCodes: ["FR", "DE"], emoji: "🌍" }), null);
    assert.equal(destinationFlag({ scope: "global", countryCodes: [], emoji: null }), null);
  });
});
