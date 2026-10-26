import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeFacts, type FactPlan } from "../product-facts";

const plan = (over: Partial<FactPlan>): FactPlan => ({
  scope: "local",
  countries: [{ code: "JP", name: "Japan" }],
  networks: [{ countryCode: "JP", operator: "SoftBank", network: "4G" }],
  breakoutIp: [],
  dataType: "total",
  speed: [],
  tethering: true,
  billingStarts: "first_connection",
  preInstallDays: 180,
  topupMode: "none",
  vpn: false,
  voiceMinutes: 0,
  smsCount: 0,
  ...over,
});

describe("summarizeFacts", () => {
  it("is nothing for a product without plans", () => {
    assert.equal(summarizeFacts([]), null);
  });

  it("keeps an operator once, at its best network, and the best speed overall", () => {
    const facts = summarizeFacts([
      plan({}),
      plan({ networks: [{ countryCode: "JP", operator: "softbank", network: "5G" }, { countryCode: "JP", operator: "KDDI", network: "LTE" }] }),
    ])!;
    assert.equal(facts.networks.length, 2);
    assert.equal(facts.networks.find((network) => network.operator.toLowerCase() === "softbank")?.network, "5G");
    assert.equal(facts.topSpeed, "5G");
  });

  it("states a fact the plans agree on, and leaves open one they do not", () => {
    const agreed = summarizeFacts([plan({}), plan({ preInstallDays: 30 })])!;
    assert.equal(agreed.hotspot, true);
    assert.deepEqual(agreed.billingStarts, ["first_connection"]);
    assert.equal(agreed.installWithinDays, 30, "the shortest install window");
    const differing = summarizeFacts([plan({}), plan({ tethering: false, billingStarts: "on_purchase", dataType: "unlimited" })])!;
    assert.equal(differing.hotspot, null);
    assert.deepEqual(differing.billingStarts, ["first_connection", "on_purchase"]);
    assert.deepEqual(differing.dataTypes, ["total", "unlimited"]);
  });

  it("collects coverage, exit IPs and extras across plans", () => {
    const facts = summarizeFacts([
      plan({ scope: "regional", countries: [{ code: "FR", name: "France" }, { code: "DE", name: "Germany" }], breakoutIp: ["GB"], vpn: true }),
      plan({ scope: "regional", countries: [{ code: "DE", name: "Germany" }, { code: "IT", name: "Italy" }], breakoutIp: ["GB", "NO"], smsCount: 10 }),
    ])!;
    assert.equal(facts.scope, "regional");
    assert.deepEqual(facts.countries.map((country) => country.code), ["FR", "DE", "IT"]);
    assert.deepEqual(facts.breakoutIp, ["GB", "NO"]);
    assert.equal(facts.vpn, "some");
    assert.equal(facts.sms, true);
    assert.equal(facts.voice, false);
  });
});
