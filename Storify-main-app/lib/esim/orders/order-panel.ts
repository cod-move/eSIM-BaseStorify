import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { Order } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { EsimTopup } from "@/models/esim-topup.model";
import { EsimNumberOrder } from "@/models/esim-number-order.model";
import { EsimNumberOp } from "@/models/esim-number-op.model";
import { formatAmount } from "@/lib/esim/numbers/line";
import { planTitle } from "@/lib/esim/account/display";
import { esimUnitOutcome, topupUnitOutcome, type UnitOutcome } from "@/lib/esim/orders/unit-status";

/**
 * The eSIM part of an order (ORD-11, patch P13): each eSIM bought for it and
 * each top-up and number card, with where it stands — for the shopper's order page and the
 * admin's. Null when the order has none, so the page shows nothing.
 */

export interface OrderEsimUnit {
  kind: "esim" | "topup" | "number";
  /** Plan or top-up name. */
  title: string;
  outcome: UnitOutcome;
  /** The eSIM's page: `/account/esims/<id>` for the shopper, `/admin/esim/esims/<id>` for admins. */
  esimId: string | null;
  /** A number card's page: `/account/esims/numbers/<id>` for the shopper; admins find it by number. */
  numberId?: string | null;
  msisdn?: string | null;
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
  const [jobs, topups, numbers, numberOps] = await Promise.all([
    EsimFulfillment.find({ order: orderId }).sort({ lineIndex: 1, unit: 1 }).lean(),
    EsimTopup.find({ order: orderId }).sort({ lineIndex: 1 }).lean(),
    EsimNumberOrder.find({ order: orderId }).sort({ lineIndex: 1 }).lean(),
    EsimNumberOp.find({ order: orderId, source: "line" }).sort({ lineIndex: 1 }).lean(),
  ]);
  if (!jobs.length && !topups.length && !numbers.length && !numberOps.length) return null;

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
  for (const number of numbers) {
    units.push({
      kind: "number",
      title: number.msisdn ? `+${number.msisdn}` : "Phone number",
      outcome: topupUnitOutcome({ state: number.state === "fulfilled" ? "completed" : number.state, refundState: number.refund?.state ?? null }),
      esimId: null,
      numberId: number.state === "fulfilled" && number.number ? String(number.number) : null,
      msisdn: number.msisdn || null,
      iccid: null,
      refundAmount: number.refund?.amount ?? null,
      jobState: admin ? number.state : null,
      providerCode: admin ? "topconnect" : null,
      lastError: admin && number.lastError ? `${number.lastError.code}: ${number.lastError.message}` : null,
    });
  }
  // Credit or a package bought for a number later (NUM-08/09); a number's first ones show with the number.
  for (const op of numberOps) {
    units.push({
      kind: "topup",
      title: `+${op.msisdn} · ${op.kind === "packet" ? op.packet?.name ?? "Data package" : `${formatAmount(op.amountMinor, op.currency)} credit`}`,
      outcome: topupUnitOutcome({ state: op.state === "manual" ? "processing" : op.state, refundState: op.refund?.state ?? null }),
      esimId: null,
      numberId: String(op.number),
      msisdn: op.msisdn,
      iccid: null,
      refundAmount: op.refund?.amount ?? null,
      jobState: admin ? op.state : null,
      providerCode: admin ? "topconnect" : null,
      lastError: admin && op.lastError ? `${op.lastError.code}: ${op.lastError.message}` : null,
    });
  }
  return units;
}
