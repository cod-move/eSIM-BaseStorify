import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renewsOwnPlan } from "@/lib/esim/topup/area";

describe("renewing the own plan or buying another area's", () => {
  const asia = { sku: "243", countries: ["CN", "HK", "TH", "SG"], destination: "Asia (19 countries)" };
  it("goes by the supplier's id against the plan's sku where both are known", () => {
    assert.equal(renewsOwnPlan({ name: "Asia 20", countryCodes: ["CN", "HK", "TH", "SG"], key: "243" }, asia), true);
    assert.equal(renewsOwnPlan({ name: "China", countryCodes: ["CN"], key: "156" }, asia), false);
  });
  it("else by exactly the same countries: a country within the plan is still another area", () => {
    const noSku = { ...asia, sku: null };
    assert.equal(renewsOwnPlan({ name: "Asia", countryCodes: ["SG", "TH", "HK", "CN"] }, noSku), true);
    assert.equal(renewsOwnPlan({ name: "China", countryCodes: ["CN"] }, noSku), false);
  });
  it("else by a region name equal to the plan's destination", () => {
    assert.equal(renewsOwnPlan({ name: "Europe", countryCodes: [] }, { countries: ["FR"], destination: "Europe" }), true);
    assert.equal(renewsOwnPlan({ name: "Asia", countryCodes: [] }, { countries: ["FR"], destination: "Europe" }), false);
  });
  it("counts a top-up that does not say where it works as a renewal", () => {
    assert.equal(renewsOwnPlan(null, asia), true);
  });
});

describe("BNESIM renewals by area id", () => {
  it("renews when the recharge is for the same ISO2 country or the same region, whatever the product", () => {
    assert.equal(renewsOwnPlan({ name: "Japan", countryCodes: ["JP"], key: "JP" }, { countries: ["JP"], areaKey: "JP" }), true);
    assert.equal(renewsOwnPlan({ name: "Korea", countryCodes: ["KR"], key: "KR" }, { countries: ["JP"], areaKey: "JP" }), false);
    assert.equal(renewsOwnPlan({ name: "Europe", countryCodes: ["FR", "DE"], key: "region:europe" }, { countries: ["FR", "DE", "IT"], areaKey: "region:europe" }), true);
  });
});
