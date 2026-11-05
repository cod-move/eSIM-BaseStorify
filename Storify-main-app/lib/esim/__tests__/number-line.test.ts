import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardChargeRate, cardUsdMinor, formatAmount, numberLineLabel, numberLinePriceMinor, parseNumberChoice, rechargePreset, rechargeProblem, rechargeSuggestions, rechargeUsdMinor } from "../numbers/line";
import { parseLineAttributes, withLineDays } from "../cart/line-attributes";

const ID = "a".repeat(24);

describe("number card line", () => {
  it("takes a whole amount from the set minimum (€2 unless changed) to 300, never none", () => {
    assert.equal(rechargeProblem(200), null);
    assert.equal(rechargeProblem(30_000), null);
    assert.match(rechargeProblem(0)!, /whole amount/);
    assert.match(rechargeProblem(100)!, /between 2 and 300/);
    assert.match(rechargeProblem(30_100)!, /between 2 and 300/);
    assert.match(rechargeProblem(550)!, /whole amount/);
    assert.equal(rechargeProblem(300, 300), null);
    assert.match(rechargeProblem(1000, 1500)!, /between 15 and 300/);
  });

  it("offers amounts from the minimum and starts on €5", () => {
    assert.deepEqual(rechargeSuggestions(200), [200, 500, 1000, 2000, 5000, 10_000]);
    assert.deepEqual(rechargeSuggestions(500), [500, 1000, 2000, 5000, 10_000]);
    assert.deepEqual(rechargeSuggestions(300), [300, 500, 1000, 2000, 5000, 10_000]);
    assert.deepEqual(rechargeSuggestions(1500), [1500, 2000, 5000, 10_000]);
    assert.equal(rechargePreset(300), 500);
    assert.equal(rechargePreset(500), 500);
    assert.equal(rechargePreset(1500), 1500);
  });

  it("prices a euro recharge at the rate plus the buffer, rounded up", () => {
    assert.equal(rechargeUsdMinor(0, 0, 3), 0);
    assert.equal(rechargeUsdMinor(1000, 1.08, 3), 1113); // 1000 × 1.08 × 1.03 = 1112.4
    assert.equal(rechargeUsdMinor(1000, 1.1, 0), 1100);
    assert.throws(() => rechargeUsdMinor(500, 0, 3));
    assert.equal(numberLinePriceMinor({ numberUsdMinor: 3500, rechargeUsdMinor: 1113, packetUsdMinor: 1299 }), 5912);
  });

  it("charges every card-currency price in USD at the rate plus the buffer, rounded up", () => {
    const rate = cardChargeRate(1.08, 3); // 1.1124 USD per euro
    assert.equal(cardUsdMinor(0, rate), 0);
    assert.equal(cardUsdMinor(1500, rate), 1669); // €15 number: 1668.6
    assert.equal(cardUsdMinor(1000, rate), rechargeUsdMinor(1000, 1.08, 3), "credit and the other parts convert alike");
    assert.throws(() => cardUsdMinor(500, 0));
  });

  it("names the line by the number, the credit and the package", () => {
    assert.equal(numberLineLabel({ dialCode: "372", nationalNumber: "55501234", recharge: 1000, rechargeCurrency: "EUR", packetName: "EU+ 5GB" }), "+372 55501234 · €10 credit · EU+ 5GB");
    assert.equal(numberLineLabel({ dialCode: "44", nationalNumber: "7700900123", recharge: 0, rechargeCurrency: "EUR" }), "+44 7700900123");
    assert.equal(formatAmount(1050, "CHF"), "10.50 CHF");
  });

  it("reads the shopper's choice and refuses anything else", () => {
    assert.deepEqual(parseNumberChoice({ id: ID, recharge: 500, packet: "b".repeat(24) }), { id: ID, recharge: 500, packet: "b".repeat(24) });
    assert.deepEqual(parseNumberChoice({ id: ID, packet: "" }), { id: ID });
    assert.throws(() => parseNumberChoice({ id: ID, recharge: 0 }), /whole amount/);
    assert.throws(() => parseNumberChoice({ id: "x" }), /Choose a number/);
    assert.throws(() => parseNumberChoice({ id: ID, recharge: "5" }), /whole amount/);
    assert.throws(() => parseNumberChoice({ id: ID, packet: 7 }), /Unknown data package/);
  });

  it("is a line option of its own, and names the order line", () => {
    assert.deepEqual(parseLineAttributes({ number: { id: ID, recharge: 1000 } }), { number: { id: ID, recharge: 1000 } });
    assert.throws(() => parseLineAttributes({ number: { id: ID }, days: 3 }), /no other options/);
    const snapshot = withLineDays(
      { lineAttributes: { number: { id: ID }, label: "+372 55501234 · €10 credit" } },
      { variantLabel: "Phone number", variantOptions: [{ name: "Number", value: "Phone number" }] },
    );
    assert.equal(snapshot.variantLabel, "+372 55501234 · €10 credit");
    assert.equal(snapshot.variantOptions[0]!.value, "+372 55501234 · €10 credit");
  });
});
