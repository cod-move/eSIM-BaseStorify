import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freshOrderNumber, randomOrderNumber } from "@/lib/esim/orders/order-number";

describe("online order numbers", () => {
  it("are the prefix, the day and six random digits", () => {
    assert.equal(randomOrderNumber("ORD", new Date("2026-11-06T23:59:00Z"), () => 42), "ORD261106000042");
    assert.match(randomOrderNumber("SHOP"), /^SHOP\d{12}$/);
  });

  it("do not follow one another", () => {
    const numbers = new Set(Array.from({ length: 50 }, () => randomOrderNumber("ORD")));
    assert.ok(numbers.size > 45);
  });

  it("skip a number an order already has", async () => {
    const seen: string[] = [];
    const number = await freshOrderNumber("ORD", async (candidate) => {
      seen.push(candidate);
      return seen.length < 3;
    });
    assert.equal(seen.length, 3);
    assert.equal(number, seen[2]);
    await assert.rejects(freshOrderNumber("ORD", async () => true));
  });
});
