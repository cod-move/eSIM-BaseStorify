import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STORE_TIME_ZONE,
  addStoreDays,
  fromStoreWall,
  storeDay,
  storeDayEnd,
  storeDayStart,
  storeDayString,
  storeMonthStart,
  storeOffsetMs,
  toStoreWall,
} from "../store-zone";

describe("store time zone", () => {
  it("defaults to Singapore", () => {
    assert.equal(STORE_TIME_ZONE, "Asia/Singapore");
    assert.equal(storeOffsetMs(new Date("2026-11-23T00:00:00Z")), 8 * 3600_000);
  });

  it("puts an early-morning Singapore order on its own day", () => {
    // 07:30 in Singapore on the 23rd is still the 22nd in UTC.
    const order = new Date("2026-11-22T23:30:00Z");
    assert.equal(storeDayString(order), "2026-11-23");
    assert.equal(storeDayStart(order).toISOString(), "2026-11-22T16:00:00.000Z");
    assert.equal(storeDayEnd(storeDayStart(order)).toISOString(), "2026-11-23T15:59:59.999Z");
  });

  it("reads a picked day as the store's midnight and refuses non-days", () => {
    assert.equal(storeDay("2026-11-23")?.toISOString(), "2026-11-22T16:00:00.000Z");
    assert.equal(storeDay("2026-02-31"), null);
    assert.equal(storeDay("23/11/2026"), null);
  });

  it("starts months and steps days on the store's calendar", () => {
    const at = new Date("2026-11-30T17:00:00Z"); // 1 Dec, 01:00 in Singapore
    assert.equal(storeMonthStart(at).toISOString(), "2026-11-30T16:00:00.000Z");
    assert.equal(storeMonthStart(at, -1).toISOString(), "2026-10-31T16:00:00.000Z");
    assert.equal(addStoreDays(storeDayStart(at), -1).toISOString(), "2026-11-29T16:00:00.000Z");
  });

  it("round-trips the wall clock, and follows daylight saving in other zones", () => {
    const at = new Date("2026-03-08T12:34:56Z");
    assert.equal(fromStoreWall(toStoreWall(at)).toISOString(), at.toISOString());
    // New York moves to UTC−4 on 8 March 2026; midnight that day is still EST.
    assert.equal(storeDay("2026-03-08", "America/New_York")?.toISOString(), "2026-03-08T05:00:00.000Z");
    assert.equal(storeDay("2026-03-09", "America/New_York")?.toISOString(), "2026-03-09T04:00:00.000Z");
  });
});
