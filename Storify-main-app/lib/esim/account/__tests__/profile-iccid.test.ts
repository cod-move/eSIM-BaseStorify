import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iccidFromStellarRaw, planIccidBackfill } from "../profile-iccid";

const ICCID = "8944476500001234567";
const OTHER = "8944476500009999999";
const card = { id: "esim-1", sim_id: "1234567890123456", status: "fulfilled" };

describe("iccidFromStellarRaw", () => {
  it("reads an eSIM issued here (raw is the eSIM read)", () => {
    assert.deepEqual(iccidFromStellarRaw({ ...card, iccid: ICCID }), { iccid: ICCID, conflict: false });
  });

  it("reads a migrated eSIM after a refresh (raw.latest.esim)", () => {
    const raw = { legacyId: 7, latest: { at: new Date(), esim: { ...card, iccid: ICCID }, usage: null, error: null } };
    assert.equal(iccidFromStellarRaw(raw).iccid, ICCID);
  });

  it("reads the usage answer and a raw wrapped under `order`", () => {
    assert.equal(iccidFromStellarRaw({ legacyId: 7, latest: { usage: { data: {}, iccid: ICCID } } }).iccid, ICCID);
    assert.equal(iccidFromStellarRaw({ order: { ...card, sim: { iccid: ICCID } }, latest: { esim: null } }).iccid, ICCID);
  });

  it("agrees with itself across places", () => {
    const raw = { ...card, iccid: ICCID, latest: { esim: { ...card, installation: { iccid: ICCID } } } };
    assert.deepEqual(iccidFromStellarRaw(raw), { iccid: ICCID, conflict: false });
  });

  it("reports two different ICCIDs as a conflict", () => {
    const raw = { ...card, iccid: ICCID, latest: { esim: { ...card, iccid: OTHER } } };
    assert.deepEqual(iccidFromStellarRaw(raw), { iccid: null, conflict: true });
  });

  it("has none for a migrated eSIM never refreshed, or a non-object raw", () => {
    assert.deepEqual(iccidFromStellarRaw({ legacyId: 7 }), { iccid: null, conflict: false });
    assert.deepEqual(iccidFromStellarRaw(null), { iccid: null, conflict: false });
    assert.deepEqual(iccidFromStellarRaw("x"), { iccid: null, conflict: false });
  });
});

describe("planIccidBackfill", () => {
  it("applies free ICCIDs, skips ones held elsewhere or read twice", () => {
    const plan = planIccidBackfill(
      [
        { id: "a", iccid: ICCID },
        { id: "b", iccid: OTHER },
        { id: "c", iccid: "8944476500005555555" },
        { id: "d", iccid: "8944476500005555555" },
      ],
      new Map([[OTHER, "z"]]),
    );
    assert.deepEqual(plan.apply, [{ id: "a", iccid: ICCID }]);
    assert.deepEqual(plan.taken, [{ id: "b", iccid: OTHER, holder: "z" }]);
    assert.deepEqual(plan.shared.map((row) => row.id), ["c", "d"]);
  });
});
