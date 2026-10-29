import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { EsimTopup } from "@/models/esim-topup.model";
import { buildReport, reportRange, type EsimReport, type JobRow, type SaleRow } from "@/lib/esim/reports/build";

/**
 * Admin → eSIM → Reports (ADM-17): reads the range's eSIMs, top-ups and
 * fulfilment jobs, and hands them to `buildReport`.
 *
 * eSIMs count by the day they were issued, top-ups by the day they completed,
 * jobs by the day they were queued. A job stopped because its order was
 * refunded is left out of the success rate: nothing was tried.
 */

export interface EsimReportPage extends EsimReport {
  range: { from: string; to: string; bucket: "day" | "month" };
  /** eSIMs issued in the range with no sale snapshot (bought before snapshots, or imported); not in the figures. */
  withoutSnapshot: number;
}

type Id = mongoose.Types.ObjectId;

export async function esimReport(input: { from?: string; to?: string }): Promise<EsimReportPage> {
  await connectDB();
  const range = reportRange(input);
  const between = { $gte: range.from, $lt: range.to };

  const [profiles, topups, jobs] = await Promise.all([
    EsimProfile.find({ fulfilledAt: between })
      .select({ snapshot: 1, status: 1, cancellation: 1, fulfilledAt: 1 })
      .lean<Array<Pick<IEsimProfile, "snapshot" | "status" | "cancellation" | "fulfilledAt">>>(),
    EsimTopup.find({ state: "completed", completedAt: between })
      .select({ esim: 1, plan: 1, providerCode: 1, priceMinor: 1, costUsdMinor: 1, completedAt: 1 })
      .lean<Array<{ esim: Id | null; plan: Id | null; providerCode: string; priceMinor: number; costUsdMinor?: number | null; completedAt: Date }>>(),
    EsimFulfillment.find({ createdAt: between, "lastError.code": { $ne: "order_refunded" } })
      .select({ state: 1, createdAt: 1, history: 1 })
      .lean<Array<{ state: JobRow["state"]; createdAt: Date; history: Array<{ at: Date; event: string }> }>>(),
  ]);

  let withoutSnapshot = 0;
  const sales: SaleRow[] = [];
  for (const profile of profiles) {
    const snapshot = profile.snapshot;
    if (!snapshot) {
      withoutSnapshot += 1;
      continue;
    }
    sales.push({
      kind: "esim",
      at: new Date(profile.fulfilledAt!),
      providerCode: snapshot.providerCode,
      destination: snapshot.destination,
      scope: snapshot.scope,
      saleMinor: snapshot.sale.amountMinor,
      costUsdMinor: snapshot.cost.usdMinor,
      voided: profile.status === "refunded" || profile.cancellation?.state === "cancelled",
    });
  }

  // A top-up counts for the destination of the eSIM it went to.
  const esimIds = topups.map((topup) => topup.esim).filter(Boolean) as Id[];
  const planIds = topups.map((topup) => topup.plan).filter(Boolean) as Id[];
  const [targets, plans] = await Promise.all([
    esimIds.length ? EsimProfile.find({ _id: { $in: esimIds } }).select({ snapshot: 1 }).lean<Array<{ _id: Id; snapshot: IEsimProfile["snapshot"] }>>() : [],
    planIds.length ? EsimPlan.find({ _id: { $in: planIds } }).select({ destination: 1, coverage: 1 }).lean<Array<{ _id: Id; destination: string; coverage: { scope: string } }>>() : [],
  ]);
  const targetById = new Map(targets.map((target) => [String(target._id), target]));
  const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
  for (const topup of topups) {
    const snapshot = topup.esim ? targetById.get(String(topup.esim))?.snapshot : null;
    const plan = topup.plan ? planById.get(String(topup.plan)) : null;
    sales.push({
      kind: "topup",
      at: new Date(topup.completedAt),
      providerCode: topup.providerCode,
      destination: snapshot?.destination ?? plan?.destination ?? "",
      scope: snapshot?.scope ?? plan?.coverage.scope ?? "",
      saleMinor: topup.priceMinor,
      costUsdMinor: topup.costUsdMinor ?? null,
      voided: false,
    });
  }

  const jobRows: JobRow[] = jobs.map((job) => {
    const issued = job.state === "fulfilled"
      ? job.history.find((entry) => entry.event === "fulfilled" || entry.event === "admin_bind")
      : undefined;
    return { state: job.state, createdAt: new Date(job.createdAt), doneAt: issued ? new Date(issued.at) : null };
  });

  const report = buildReport({ sales, jobs: jobRows }, range);
  return {
    ...report,
    range: { from: range.fromKey, to: range.toKey, bucket: range.bucket },
    withoutSnapshot,
  };
}
