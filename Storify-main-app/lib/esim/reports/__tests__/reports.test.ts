import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReport, bucketsBetween, reportRange, type JobRow, type SaleRow } from "../build";
import { purchaseCostMinor, unitSaleMinor, usdMinorOf } from "../snapshot";

const sale = (overrides: Partial<SaleRow>): SaleRow => ({
  kind: "esim",
  at: new Date("2026-10-02T10:00:00Z"),
  providerCode: "esimaccess",
  destination: "Japan",
  scope: "local",
  saleMinor: 1000,
  costUsdMinor: 600,
  voided: false,
  ...overrides,
});

describe("sale snapshot money", () => {
  it("spreads an order discount over the units", () => {
    // Two lines, 10.00 × 1 and 5.00 × 2, charged 18.00 after a 2.00 discount.
    const order = { total: 18, items: [{ price: 10, quantity: 1 }, { price: 5, quantity: 2 }] };
    assert.equal(unitSaleMinor(order, 0), 900);
    assert.equal(unitSaleMinor(order, 1), 450);
    assert.equal(unitSaleMinor(order, 5), 0);
    assert.equal(unitSaleMinor({ total: 0, items: [{ price: 10, quantity: 1 }] }, 0), 0);
  });

  it("charges a per-day plan for the days bought", () => {
    assert.equal(purchaseCostMinor({ amountMinor: 120, billingUnit: "day" }, 7), 840);
    assert.equal(purchaseCostMinor({ amountMinor: 120, billingUnit: "day" }, null), 120);
    assert.equal(purchaseCostMinor({ amountMinor: 500, billingUnit: "plan" }, 7), 500);
  });

  it("converts only at a known rate", () => {
    assert.equal(usdMinorOf(1000, 1.08), 1080);
    assert.equal(usdMinorOf(1000, null), null);
    assert.equal(usdMinorOf(1000, 0), null);
  });
});

describe("buildReport", () => {
  const range = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-04T00:00:00Z"), bucket: "day" as const };

  it("adds up sales and margin by supplier, destination and day", () => {
    const report = buildReport(
      {
        sales: [
          sale({}),
          sale({ providerCode: "stellar", saleMinor: 2000, costUsdMinor: 1500, at: new Date("2026-10-03T01:00:00Z") }),
          sale({ kind: "topup", destination: "Thailand", saleMinor: 500, costUsdMinor: null }),
          sale({ voided: true, saleMinor: 800 }),
        ],
        jobs: [],
      },
      range,
    );
    assert.equal(report.totals.units, 3);
    assert.equal(report.totals.esims, 2);
    assert.equal(report.totals.topups, 1);
    assert.equal(report.totals.salesMinor, 3500);
    assert.equal(report.totals.costMinor, 2100);
    assert.equal(report.totals.marginMinor, 900);
    // 900 over the 3000 of sales with a known cost, not over all 3500.
    assert.equal(report.totals.marginPercent, 30);
    assert.equal(report.totals.costUnknown, 1);
    assert.equal(report.totals.voidedUnits, 1);
    assert.equal(report.totals.voidedMinor, 800);
    assert.deepEqual(report.byProvider.map((row) => [row.key, row.salesMinor]), [["stellar", 2000], ["esimaccess", 1500]]);
    assert.deepEqual(report.byDestination.map((row) => [row.key, row.units]), [["Japan", 2], ["Thailand", 1]]);
    assert.deepEqual(report.series.map((row) => [row.key, row.units]), [["2026-10-01", 0], ["2026-10-02", 2], ["2026-10-03", 1]]);
    assert.equal(report.byDestination.find((row) => row.key === "Thailand")!.marginPercent, null);
  });

  it("measures fulfilment success and time", () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 9, 2, 0, 0, seconds));
    const jobs: JobRow[] = [
      { state: "fulfilled", createdAt: at(0), doneAt: at(10) },
      { state: "fulfilled", createdAt: at(0), doneAt: at(30) },
      { state: "fulfilled", createdAt: at(0), doneAt: at(200) },
      { state: "failed", createdAt: at(0), doneAt: null },
      { state: "queued", createdAt: at(0), doneAt: null },
    ];
    const { fulfilment } = buildReport({ sales: [], jobs }, range);
    assert.equal(fulfilment.total, 5);
    assert.equal(fulfilment.open, 1);
    assert.equal(fulfilment.successRate, 75);
    assert.equal(fulfilment.avgSeconds, 80);
    assert.equal(fulfilment.medianSeconds, 30);
    assert.equal(buildReport({ sales: [], jobs: [] }, range).fulfilment.successRate, null);
  });
});

describe("report range", () => {
  const now = new Date("2026-10-29T15:00:00Z");

  it("defaults to the last 30 days, today included", () => {
    const range = reportRange({}, now);
    assert.equal(range.toKey, "2026-10-29");
    assert.equal(range.to.toISOString(), "2026-10-30T00:00:00.000Z");
    assert.equal(range.fromKey, "2026-09-30");
    assert.equal(range.bucket, "day");
  });

  it("caps a range at a year and groups long ones by month", () => {
    const range = reportRange({ from: "2020-01-01", to: "2026-10-29" }, now);
    assert.equal(range.bucket, "month");
    assert.equal((range.to.getTime() - range.from.getTime()) / 86_400_000, 366);
  });

  it("ignores malformed and reversed dates", () => {
    assert.equal(reportRange({ from: "nonsense", to: "2026-13-45" }, now).toKey, "2026-10-29");
    const reversed = reportRange({ from: "2026-10-20", to: "2026-10-10" }, now);
    assert.equal(reversed.fromKey, "2026-10-10");
  });

  it("lists every month bucket", () => {
    assert.deepEqual(
      bucketsBetween(new Date("2026-08-15T00:00:00Z"), new Date("2026-10-02T00:00:00Z"), "month"),
      ["2026-08", "2026-09", "2026-10"],
    );
  });
});
