import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deductionOrder, deductionProblem, parseMinor, planDeduction, toMajor, toMinor } from "../deduct-policy";

describe("deductionProblem", () => {
  it("accepts a whole number of cents up to the balance", () => {
    assert.equal(deductionProblem(1, 1), null);
    assert.equal(deductionProblem(1250, 5000), null);
    assert.equal(deductionProblem(5000, 5000), null, "down to exactly zero");
  });

  it("never takes the balance below zero", () => {
    assert.match(deductionProblem(5001, 5000)!, /more than/);
    assert.match(deductionProblem(1, 0)!, /no balance/);
  });

  it("refuses amounts that are not whole positive cents", () => {
    assert.ok(deductionProblem(0, 5000));
    assert.ok(deductionProblem(-100, 5000));
    assert.ok(deductionProblem(12.5, 5000), "fractions of a cent");
    assert.ok(deductionProblem(Number.NaN, 5000));
    assert.ok(deductionProblem(100_000_001, 200_000_000), "over the cap");
  });
});

describe("parseMinor", () => {
  it("reads amounts as cents without floating point", () => {
    assert.equal(parseMinor("12"), 1200);
    assert.equal(parseMinor("12.5"), 1250);
    assert.equal(parseMinor("12,50"), 1250);
    assert.equal(parseMinor(" 0.01 "), 1);
    assert.equal(parseMinor("0.29"), 29, "0.29 * 100 is 28.999… in floating point");
    assert.equal(parseMinor("1.005"), null);
    assert.equal(parseMinor("0"), null);
    assert.equal(parseMinor("-5"), null);
    assert.equal(parseMinor("abc"), null);
  });
});

describe("toMinor / toMajor", () => {
  it("round-trips Storify's major-unit amounts", () => {
    assert.equal(toMinor(0.29), 29);
    assert.equal(toMinor(10.1 - 0.3), 980);
    assert.equal(toMajor(29), 0.29);
    assert.equal(toMajor(980), 9.8);
    assert.equal(toMinor(Number.NaN), 0);
  });
});

describe("planDeduction", () => {
  const lots = [
    { id: "never", remainingMinor: 1000, expiresAt: null, createdAt: "2026-01-01" },
    { id: "late", remainingMinor: 500, expiresAt: "2027-06-01", createdAt: "2026-02-01" },
    { id: "soon", remainingMinor: 300, expiresAt: "2026-12-01", createdAt: "2026-03-01" },
  ];

  it("takes from the lot that expires first, never-expiring last", () => {
    assert.deepEqual(deductionOrder(lots).map((lot) => lot.id), ["soon", "late", "never"]);
    assert.deepEqual(planDeduction(lots, 600), { takes: [{ id: "soon", amountMinor: 300 }, { id: "late", amountMinor: 300 }], short: 0 });
  });

  it("can take everything, and no more", () => {
    assert.deepEqual(planDeduction(lots, 1800).short, 0);
    const over = planDeduction(lots, 1801);
    assert.equal(over.short, 1);
    assert.equal(over.takes.reduce((sum, take) => sum + take.amountMinor, 0), 1800);
  });

  it("the older lot first among lots with the same expiry", () => {
    const same = [
      { id: "b", remainingMinor: 100, expiresAt: null, createdAt: "2026-05-01" },
      { id: "a", remainingMinor: 100, expiresAt: null, createdAt: "2026-04-01" },
    ];
    assert.deepEqual(planDeduction(same, 150).takes, [{ id: "a", amountMinor: 100 }, { id: "b", amountMinor: 50 }]);
  });

  it("skips empty lots", () => {
    assert.deepEqual(planDeduction([{ id: "x", remainingMinor: 0, createdAt: "2026-01-01" }], 10), { takes: [], short: 10 });
  });
});
