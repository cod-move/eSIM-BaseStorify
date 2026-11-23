import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDashboardPeriod, resolveNamedPeriod, toDayString } from "@/lib/admin/dashboard-period";
import { resolveDateFilter } from "@/lib/date-filter";
import { buildChartSeries, bucketStart, parseBucketKey } from "@/lib/admin/order-chart-buckets";
import { closableMonths, formatMonthLabel, monthBounds } from "@/lib/finance/months";

/**
 * Patch P82: the admin's days and months are Singapore's (the default store
 * zone). 2026-11-23 07:30 in Singapore is 2026-11-22 23:30 UTC.
 */
const now = new Date("2026-11-22T23:30:00Z");

describe("admin periods in the store's zone (P82)", () => {
  it("resolves today, yesterday, the last 7 days and this month at Singapore midnight", () => {
    const today = resolveNamedPeriod("today", now)!;
    assert.equal(today.from.toISOString(), "2026-11-22T16:00:00.000Z");
    assert.equal(today.to.toISOString(), "2026-11-23T15:59:59.999Z");
    assert.equal(resolveNamedPeriod("yesterday", now)!.from.toISOString(), "2026-11-21T16:00:00.000Z");
    assert.equal(resolveNamedPeriod("week", now)!.from.toISOString(), "2026-11-16T16:00:00.000Z");
    assert.equal(resolveNamedPeriod("month", now)!.from.toISOString(), "2026-10-31T16:00:00.000Z");
    assert.equal(toDayString(today.from), "2026-11-23");
  });

  it("reads picked days, on the dashboard and in list filters, as Singapore days", () => {
    const picked = resolveDashboardPeriod({ from: "2026-11-01", to: "2026-11-02" }, now);
    assert.equal(picked.range!.from.toISOString(), "2026-10-31T16:00:00.000Z");
    assert.equal(picked.range!.to.toISOString(), "2026-11-02T15:59:59.999Z");
    const filter = resolveDateFilter("2026-11-01_2026-11-02", now)!;
    assert.equal(filter.from.toISOString(), "2026-10-31T16:00:00.000Z");
    assert.equal(filter.to.toISOString(), "2026-11-02T15:59:59.999Z");
    assert.equal(resolveDateFilter("today", now)!.from.toISOString(), "2026-11-22T16:00:00.000Z");
  });

  it("buckets the orders chart by Singapore day and reads the query's keys back", () => {
    assert.equal(bucketStart(now, "day").toISOString(), "2026-11-22T16:00:00.000Z");
    assert.equal(parseBucketKey("2026-11-23", "day").toISOString(), "2026-11-22T16:00:00.000Z");
    assert.equal(parseBucketKey("2026-11", "month").toISOString(), "2026-10-31T16:00:00.000Z");
    const week = resolveNamedPeriod("week", now)!;
    const series = buildChartSeries(
      [{ start: parseBucketKey("2026-11-23", "day"), pos: false, orders: 2, sales: 10 }],
      week,
      "day",
    );
    assert.equal(series.points.length, 7);
    assert.equal(series.points[6].onlineOrders, 2);
  });

  it("closes finance months on Singapore's calendar", () => {
    const november = monthBounds("2026-11");
    assert.equal(november.from.toISOString(), "2026-10-31T16:00:00.000Z");
    assert.equal(november.to.toISOString(), "2026-11-30T15:59:59.999Z");
    // 1 December 01:00 in Singapore: November is the latest finished month.
    assert.equal(closableMonths(new Date("2026-11-30T17:00:00Z"), 1)[0], "2026-11");
    assert.equal(formatMonthLabel("2026-11", "en-US"), "November 2026");
  });
});
