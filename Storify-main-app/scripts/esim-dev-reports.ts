/**
 * Check of the eSIM report (ADM-17) against a development database.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-reports.ts
 *
 * Writes a few eSIMs, a top-up and fulfilment jobs dated January 2001, so no
 * real data falls in the range, reads the report for that month and checks
 * the sums. Removes what it made and reports any collection whose count
 * changed. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimTopup } from "@/models/esim-topup.model";

const tag = `e2e-reports-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const made = { profiles: [] as Id[], topups: [] as Id[], jobs: [] as Id[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

const day = (date: number, hour = 12) => new Date(Date.UTC(2001, 0, date, hour));

async function run() {
  const { esimReport } = await import("@/lib/esim/reports/service");
  const order = new ObjectId();
  const snapshot = (providerCode: string, destination: string, sale: number, usd: number | null) => ({
    providerCode,
    providerPlanId: tag,
    planName: "Report test",
    destination,
    scope: "local",
    countries: [],
    megabytes: 1024,
    dataType: "total",
    validityDays: 7,
    durationDays: null,
    sale: { currency: "USD", amountMinor: sale },
    cost: { currency: "USD", amountMinor: usd ?? 0, usdMinor: usd, usdPerUnit: usd === null ? null : 1 },
    takenAt: day(2),
  });
  const profiles = [
    { at: day(2), status: "fulfilled", snapshot: snapshot("alpha", "Japan", 1000, 600) },
    { at: day(2), status: "fulfilled", snapshot: snapshot("beta", "Japan", 2000, null) },
    { at: day(5), status: "refunded", snapshot: snapshot("alpha", "Thailand", 700, 300) },
    { at: day(6), status: "fulfilled", snapshot: null },
  ];
  for (const [index, profile] of profiles.entries()) {
    const _id = new ObjectId();
    await EsimProfile.collection.insertOne({
      _id,
      order,
      orderNumber: tag,
      lineIndex: index,
      unit: 1,
      plan: new ObjectId(),
      providerCode: profile.snapshot?.providerCode ?? "alpha",
      status: profile.status,
      fulfilledAt: profile.at,
      snapshot: profile.snapshot,
      createdAt: profile.at,
      updatedAt: profile.at,
    });
    made.profiles.push(_id);
  }
  const topup = new ObjectId();
  await EsimTopup.collection.insertOne({
    _id: topup,
    order,
    orderNumber: tag,
    lineIndex: 9,
    quote: new ObjectId(),
    esim: made.profiles[0],
    providerCode: "alpha",
    priceMinor: 500,
    cost: { currency: "USD", amountMinor: 200 },
    costUsdMinor: 200,
    state: "completed",
    completedAt: day(3),
    nextAttemptAt: day(3),
    createdAt: day(3),
    updatedAt: day(3),
  });
  made.topups.push(topup);
  const jobs = [
    { state: "fulfilled", created: day(2, 10), history: [{ at: new Date(day(2, 10).getTime() + 20_000), event: "fulfilled" }] },
    { state: "fulfilled", created: day(2, 11), history: [{ at: new Date(day(2, 11).getTime() + 40_000), event: "fulfilled" }] },
    { state: "failed", created: day(4), history: [], lastError: { code: "rejected", message: "no", at: day(4) } },
    // Stopped because the order was refunded: not a failure of fulfilment.
    { state: "failed", created: day(4), history: [], lastError: { code: "order_refunded", message: "refunded", at: day(4) } },
  ];
  for (const [index, job] of jobs.entries()) {
    const _id = new ObjectId();
    await EsimFulfillment.collection.insertOne({
      _id,
      order,
      orderNumber: tag,
      lineIndex: index,
      unit: 1,
      variantId: new ObjectId(),
      candidates: [],
      state: job.state,
      nextAttemptAt: job.created,
      history: job.history,
      lastError: job.lastError ?? null,
      createdAt: job.created,
      updatedAt: job.created,
    });
    made.jobs.push(_id);
  }

  const report = await esimReport({ from: "2001-01-01", to: "2001-01-31" });
  assert.deepEqual(report.range, { from: "2001-01-01", to: "2001-01-31", bucket: "day" });
  assert.equal(report.totals.esims, 2);
  assert.equal(report.totals.topups, 1);
  assert.equal(report.totals.salesMinor, 3500);
  assert.equal(report.totals.costMinor, 800);
  assert.equal(report.totals.marginMinor, 700);
  assert.equal(report.totals.marginPercent, 46.7, "700 over the 1500 of sales with a known cost");
  assert.equal(report.totals.costUnknown, 1);
  assert.equal(report.totals.voidedUnits, 1);
  assert.equal(report.withoutSnapshot, 1);
  assert.deepEqual(report.byDestination.map((row) => [row.key, row.units]), [["Japan", 3]], "the top-up counts for its eSIM's destination");
  assert.deepEqual(report.byProvider.map((row) => [row.key, row.salesMinor]), [["beta", 2000], ["alpha", 1500]]);
  assert.equal(report.series.length, 31);
  assert.equal(report.series.find((row) => row.key === "2001-01-02")?.units, 2);
  assert.deepEqual(
    [report.fulfilment.total, report.fulfilment.fulfilled, report.fulfilment.failed, report.fulfilment.successRate, report.fulfilment.avgSeconds],
    [3, 2, 1, 66.7, 30],
  );
  console.log("All report checks passed.");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  try {
    await run();
  } finally {
    await EsimProfile.collection.deleteMany({ _id: { $in: made.profiles } });
    await EsimTopup.collection.deleteMany({ _id: { $in: made.topups } });
    await EsimFulfillment.collection.deleteMany({ _id: { $in: made.jobs } });
    const after = await counts();
    const changed = [...after].filter(([name, count]) => before.get(name) !== count);
    console.log(changed.length ? `Collections changed: ${JSON.stringify(changed)}` : "Cleanup left every collection as it was.");
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
