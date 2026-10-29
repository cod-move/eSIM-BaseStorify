import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { Order } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { EsimTopup } from "@/models/esim-topup.model";
import { planTitle } from "@/lib/esim/account/display";
import { esimUnitOutcome, topupUnitOutcome, type UnitOutcome } from "@/lib/esim/orders/unit-status";

/**
 * The eSIM part of an order (ORD-11, patch P13): each eSIM bought for it and
 * each top-up, with where it stands — for the shopper's order page and the
 * admin's. Null when the order has none, so the page shows nothing.
 */

export interface OrderEsimUnit {
  kind: "esim" | "topup";
  /** Plan or top-up name. */
  title: string;
  outcome: UnitOutcome;
  /** The eSIM's page: `/account/esims/<id>` for the shopper, `/admin/esim/esims/<id>` for admins. */
  esimId: string | null;
  iccid: string | null;
  refundAmount: number | null;
  /** Admins only. */
  jobState: string | null;
  providerCode: string | null;
  lastError: string | null;
}

type Id = mongoose.Types.ObjectId;

/**
 * @param shopperId when given, the order must be this shopper's (else null),
 *   and the supplier details are left out.
 */
export async function orderEsimUnits(orderId: string, options: { shopperId?: string } = {}): Promise<OrderEsimUnit[] | null> {
  if (!mongoose.isValidObjectId(orderId)) return null;
  await connectDB();
  if (options.shopperId) {
    const owned = await Order.exists({ _id: orderId, customerId: new mongoose.Types.ObjectId(options.shopperId) });
    if (!owned) return null;
  }
  const admin = !options.shopperId;
  const [jobs, topups] = await Promise.all([
    EsimFulfillment.find({ order: orderId }).sort({ lineIndex: 1, unit: 1 }).lean(),
    EsimTopup.find({ order: orderId }).sort({ lineIndex: 1 }).lean(),
  ]);
  if (!jobs.length && !topups.length) return null;

  const [profiles, plans] = await Promise.all([
    EsimProfile.find({ order: orderId }).select({ lineIndex: 1, unit: 1, iccid: 1, status: 1, cancellation: 1, snapshot: 1, durationDays: 1, plan: 1 }).lean<IEsimProfile[]>(),
    EsimPlan.find({ _id: { $in: jobs.map((job) => job.candidates[job.candidateIndex]).filter(Boolean) } })
      .select({ name: 1 })
      .lean<Array<{ _id: Id; name: string }>>(),
  ]);
  const profileOf = new Map(profiles.map((profile) => [`${profile.lineIndex}:${profile.unit}`, profile]));
  const planName = new Map(plans.map((plan) => [String(plan._id), plan.name]));

  const units: OrderEsimUnit[] = jobs.map((job) => {
    const profile = profileOf.get(`${job.lineIndex}:${job.unit}`);
    const name = profile?.snapshot?.planName ?? planName.get(String(job.candidates[job.candidateIndex])) ?? "eSIM";
    return {
      kind: "esim",
      title: planTitle(name, profile?.durationDays ?? job.durationDays),
      outcome: esimUnitOutcome({
        state: job.state,
        refundState: job.refund?.state ?? null,
        profileStatus: profile?.status ?? null,
        cancelled: profile?.cancellation?.state === "cancelled",
      }),
      esimId: profile ? String(profile._id) : null,
      iccid: profile?.iccid ?? null,
      refundAmount: job.refund?.amount ?? null,
      jobState: admin ? job.state : null,
      providerCode: admin ? job.providerCode ?? null : null,
      lastError: admin && job.lastError ? `${job.lastError.code}: ${job.lastError.message}` : null,
    };
  });
  for (const topup of topups) {
    units.push({
      kind: "topup",
      title: topup.name || "Top-up",
      outcome: topupUnitOutcome({ state: topup.state, refundState: topup.refund?.state ?? null }),
      esimId: topup.esim ? String(topup.esim) : null,
      iccid: topup.iccid,
      refundAmount: topup.refund?.amount ?? null,
      jobState: admin ? topup.state : null,
      providerCode: admin ? topup.providerCode || null : null,
      lastError: admin && topup.lastError ? `${topup.lastError.code}: ${topup.lastError.message}` : null,
    });
  }
  return units;
}
