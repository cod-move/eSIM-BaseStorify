import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cheapestData, outgoingCall, perGb, rateKey, rateTier } from "@/lib/esim/numbers/rates";
import { NUMBER_RATE_COUNTRIES, NUMBER_RATE_SURCHARGES } from "@/lib/esim/numbers/rates-data";

const byCode = (code: string) => NUMBER_RATE_COUNTRIES.find((country) => country.code === code)!;

describe("phone number eSIM rates", () => {
  it("reads TopConnect's sheet as whole cents, one row per country", () => {
    const gb = byCode("GB");
    assert.deepEqual(gb.voice, { incoming: 0, outgoing: 29, travelSim: 19 });
    assert.deepEqual(gb.sms, { any: 19, eu: 11 });
    assert.equal(cheapestData(gb)?.perMb, 4);
    const keys = NUMBER_RATE_COUNTRIES.map(rateKey);
    assert.equal(new Set(keys).size, keys.length);
    for (const country of NUMBER_RATE_COUNTRIES) {
      for (const cents of [...Object.values(country.voice ?? {}), ...Object.values(country.sms ?? {}), ...(country.data ?? []).map((net) => net.perMb)]) {
        assert.ok(Number.isInteger(cents) && cents >= 0, `${country.name}: ${cents}`);
      }
    }
  });

  it("puts the sheets' different spellings of a country together", () => {
    // "Azerbijan" on the voice sheet, "Azerbaijan" on the data sheet.
    const az = byCode("AZ");
    assert.ok(az.voice && az.data);
    // Puerto Rico is listed twice on the SMS sheet, once with a TravelSMS rate.
    assert.deepEqual(byCode("PR").sms, { any: 35, travelSim: 6 });
  });

  it("adds a destination's surcharge to a call", () => {
    const cuba = NUMBER_RATE_SURCHARGES.find((entry) => entry.code === "CU")!;
    assert.equal(outgoingCall(byCode("DE"), cuba), 35 + 85);
    assert.equal(outgoingCall(byCode("DE")), 35);
    assert.equal(outgoingCall({ code: "XX", name: "Nowhere" }, cuba), null);
    assert.ok(NUMBER_RATE_SURCHARGES.filter((entry) => entry.part === "satellite").length > 40);
  });

  it("colours a rate by how dear it is", () => {
    assert.equal(rateTier("call", 0), "free");
    assert.equal(rateTier("call", 29), "low");
    assert.equal(rateTier("call", 59), "mid");
    assert.equal(rateTier("call", 169), "high");
    assert.equal(rateTier("data", 4), "low");
    assert.equal(rateTier("data", 125), "high");
    assert.equal(perGb(4), 4096);
  });
});
