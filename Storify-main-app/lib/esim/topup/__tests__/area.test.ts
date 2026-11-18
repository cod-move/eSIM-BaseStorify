import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inOwnArea } from "@/lib/esim/topup/area";

describe("top-up area", () => {
  const asia = ["CN", "HK", "TH", "SG"];
  it("counts a top-up for countries within the plan's as its own area", () => {
    assert.equal(inOwnArea({ name: "China", countryCodes: ["CN"] }, asia), true);
    assert.equal(inOwnArea({ name: "Asia 4", countryCodes: ["HK", "TH"] }, asia), true);
  });
  it("puts one reaching outside the plan's countries under other areas", () => {
    assert.equal(inOwnArea({ name: "Afghanistan", countryCodes: ["AF"] }, asia), false);
    assert.equal(inOwnArea({ name: "China + Japan", countryCodes: ["CN", "JP"] }, asia), false);
  });
  it("takes a top-up that does not say where it works as the own area", () => {
    assert.equal(inOwnArea(null, asia), true);
    assert.equal(inOwnArea({ name: "?", countryCodes: [] }, asia), true);
  });
});
