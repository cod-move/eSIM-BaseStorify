import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReplacementCard, sameIccid } from "../import";

const ICCID = "8937204017171234567";

describe("parseReplacementCard", () => {
  it("reads ICCID, LPA, PIN1, PUK1, PIN2, PUK2 split by spaces", () => {
    assert.deepEqual(parseReplacementCard(`  ${ICCID} LPA:1$rsp.example.com$ABC-123 1234 12345678 5678 87654321 `), {
      ok: true,
      card: { iccid: ICCID, lpa: "LPA:1$rsp.example.com$ABC-123", pin1: "1234", puk1: "12345678", pin2: "5678", puk2: "87654321" },
    });
  });

  it("takes tabs or commas, an LPA without its prefix, and no PINs", () => {
    assert.deepEqual(parseReplacementCard(`${ICCID}\trsp.example.com$ABC`), {
      ok: true,
      card: { iccid: ICCID, lpa: "LPA:1$rsp.example.com$ABC", pin1: null, puk1: null, pin2: null, puk2: null },
    });
    assert.equal(parseReplacementCard(`${ICCID}, LPA:1$rsp.example.com$ABC, 1234`).ok, true);
  });

  it("refuses what is not a card", () => {
    assert.deepEqual(parseReplacementCard("LPA:1$rsp.example.com$ABC"), { ok: false, reason: "fields" });
    assert.deepEqual(parseReplacementCard("12345 LPA:1$rsp.example.com$ABC"), { ok: false, reason: "iccid" });
    assert.deepEqual(parseReplacementCard(`${ICCID} 1234 12345678`), { ok: false, reason: "lpa" });
    assert.deepEqual(parseReplacementCard(`${ICCID} LPA:1$rsp.example.com$ABC 12a4`), { ok: false, reason: "pin" });
    assert.deepEqual(parseReplacementCard(`${ICCID} LPA:1$a.b$C 1 2 3 4 5`), { ok: false, reason: "fields" });
  });
});

describe("sameIccid", () => {
  it("ignores a trailing F and case", () => {
    assert.equal(sameIccid(`${ICCID}F`, ICCID), true);
    assert.equal(sameIccid(`${ICCID}f`, `${ICCID}F`), true);
    assert.equal(sameIccid(ICCID, "8937204017171234568"), false);
    assert.equal(sameIccid(null, ICCID), false);
  });
});
