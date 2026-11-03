import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dollarsToCents, parseNumberImport, phoneNumber } from "../numbers/import";

const LPA = "LPA:1$rsp.truphone.com$ABCD-1234-EFGH";
const ICCID = "8937204017000000001";

describe("number stock import", () => {
  it("reads the supplier's space-separated sheet with the batch's price", () => {
    const text = [
      "MSISDN ICCID LPA PIN1 PUK1 PIN2 PUK2",
      `37255501234 ${ICCID} ${LPA} 1234 12345678 5678 87654321`,
      "",
    ].join("\n");
    const { rows, problems } = parseNumberImport(text, { priceMinor: 1500, premiumMinor: 0 });
    assert.deepEqual(problems, []);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      line: 2,
      msisdn: "37255501234",
      dialCode: "372",
      nationalNumber: "55501234",
      country: "EE",
      iccid: ICCID,
      lpa: LPA,
      pin1: "1234",
      puk1: "12345678",
      pin2: "5678",
      puk2: "87654321",
      priceMinor: 1500,
      premiumMinor: 0,
    });
  });

  it("adds the batch's dial code to national numbers and keeps numbers that have it", () => {
    const text = [`55501234,${ICCID},${LPA}`, `+372 5550 1235,8937204017000000002,${LPA}`].join("\n");
    const { rows } = parseNumberImport(text, { dialCode: "+372", priceMinor: 0, premiumMinor: 0 });
    assert.deepEqual(rows.map((row) => row.msisdn), ["37255501234", "37255501235"]);
    assert.equal(rows[0]!.pin1, null);
  });

  it("takes a line's own price and premium, and adds the LPA prefix when missing", () => {
    const text = `447911123456\t${ICCID}\trsp.example.com$XYZ\t1111\t22222222\t3333\t44444444\t19.9\t5\tqr.png`;
    const [row] = parseNumberImport(text, { priceMinor: 1000, premiumMinor: 0 }).rows;
    assert.equal(row!.priceMinor, 1990);
    assert.equal(row!.premiumMinor, 500);
    assert.equal(row!.lpa, "LPA:1$rsp.example.com$XYZ");
    assert.equal(row!.dialCode, "44");
    assert.equal(row!.nationalNumber, "7911123456");
  });

  it("reports bad and repeated lines by line number", () => {
    const text = [
      `abc ${ICCID} ${LPA}`,
      `37255501234 123 ${LPA}`,
      `37255501234 ${ICCID} not-an-lpa`,
      `37255501234 ${ICCID} ${LPA} 1 2 3 4 1.234 0`,
      `37255501234 ${ICCID} ${LPA}`,
      `37255501234 ${ICCID} ${LPA}`,
      "37255501234",
    ].join("\n");
    const { rows, problems } = parseNumberImport(text, { priceMinor: 0, premiumMinor: 0 });
    assert.equal(rows.length, 1);
    assert.deepEqual(problems.map((problem) => [problem.line, problem.reason]), [
      [1, "msisdn"],
      [2, "iccid"],
      [3, "lpa"],
      [4, "price"],
      [6, "duplicate"],
      [7, "fields"],
    ]);
  });

  it("refuses a number without a country code when the batch names none", () => {
    assert.equal(phoneNumber("55501234"), null);
    assert.equal(phoneNumber("0037255501234")?.msisdn, "37255501234");
  });

  it("reads dollar amounts exactly", () => {
    assert.equal(dollarsToCents("12"), 1200);
    assert.equal(dollarsToCents("0.5"), 50);
    assert.equal(dollarsToCents("$3.05"), 305);
    assert.equal(dollarsToCents("-1"), null);
    assert.equal(dollarsToCents("1.234"), null);
  });
});
