import "server-only";

import * as z from "zod";
import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimReferral, EsimReferralCommission } from "@/models/esim-referral.model";
import { getReferralSettings } from "@/lib/esim/referral/service";

/**
 * Admin → eSIM → Referrals (REF-02..04): the referral settings, and every
 * reward with who earned it, for which order and where it stands —
 * including rewards to take back by hand after a late refund.
 */

export const ReferralSettingsSchema = z.object({
  enabled: z.boolean(),
  commissionType: z.enum(["percent", "fixed"]),
  commissionValue: z.number().min(0).max(100_000),
  validityDays: z.number().int().min(0).max(3650),
  orderLimit: z.number().int().min(0).max(1000),
  holdDays: z.number().int().min(0).max(365),
  coupon: z.object({
    enabled: z.boolean(),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().min(0).max(100_000),
    days: z.number().int().min(1).max(365),
    minOrderMinor: z.number().int().min(0).max(100_000_000),
  }),
}).refine((value) => value.commissionType !== "percent" || value.commissionValue <= 100, { message: "A percent commission is at most 100", path: ["commissionValue"] })
  .refine((value) => value.coupon.type !== "percentage" || value.coupon.value <= 100, { message: "A percent discount is at most 100", path: ["coupon", "value"] });

export async function saveReferralSettings(next: z.infer<typeof ReferralSettingsSchema>) {
  await connectDB();
  const before = await getReferralSettings();
  const settings = await getEsimSettings();
  settings.referral = { ...next, coupon: { ...next.coupon } };
  await settings.save();
  return { before, after: next };
}

export type CommissionView = "attention" | "pending" | "credited" | "cancelled" | "all";

function viewQuery(view: CommissionView): Record<string, unknown> {
  switch (view) {
    case "attention":
      return { "clawback.settled": false };
    case "all":
      return {};
    default:
      return { status: view };
  }
}

export interface CommissionRow {
  id: string;
  orderId: string;
  orderNumber: string;
  referrer: string | null;
  referee: string | null;
  base: number;
  amount: number;
  currency: string;
  status: string;
  payableAt: string;
  creditedAt: string | null;
  clawback: { amount: number; settled: boolean } | null;
  note: string | null;
  createdAt: string;
}

export async function listReferralCommissions(view: CommissionView, options: { page?: number; search?: string } = {}) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = 25;
  const match: Record<string, unknown> = { ...viewQuery(view) };
  const search = options.search?.trim();
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = search.includes("@") ? await User.find({ email: pattern }).select({ _id: 1 }).limit(50).lean() : [];
    match.$or = [{ orderNumber: pattern }, ...(users.length ? [{ referrer: { $in: users.map((user) => user._id) } }, { referee: { $in: users.map((user) => user._id) } }] : [])];
  }
  const [rows, total, attention, referrals] = await Promise.all([
    EsimReferralCommission.find(match).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    EsimReferralCommission.countDocuments(match),
    EsimReferralCommission.countDocuments(viewQuery("attention")),
    EsimReferral.countDocuments({}),
  ]);
  const ids = rows.flatMap((row) => [row.referrer, row.referee]);
  const users = await User.find({ _id: { $in: ids } }).select({ email: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; email?: string }>>();
  const email = new Map(users.map((user) => [String(user._id), user.email ?? null]));
  const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);
  return {
    rows: rows.map((row): CommissionRow => ({
      id: String(row._id),
      orderId: String(row.order),
      orderNumber: row.orderNumber,
      referrer: email.get(String(row.referrer)) ?? null,
      referee: email.get(String(row.referee)) ?? null,
      base: row.base,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      payableAt: iso(row.payableAt)!,
      creditedAt: iso(row.creditedAt),
      clawback: row.clawback ? { amount: row.clawback.amount, settled: Boolean(row.clawback.settled) } : null,
      note: row.note,
      createdAt: iso(row.createdAt)!,
    })),
    counts: { attention, referrals },
    pagination: { page, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export class CommissionActionError extends Error {}

/** Cancels a reward not paid yet, or records that a claw-back was dealt with by hand. */
export async function commissionAction(id: string, action: "cancel" | "settle", note: string) {
  if (!mongoose.isValidObjectId(id)) throw new CommissionActionError("Unknown reward");
  const commission = await EsimReferralCommission.findById(id);
  if (!commission) throw new CommissionActionError("Unknown reward");
  if (action === "cancel") {
    if (commission.status !== "pending") throw new CommissionActionError("Only a reward not paid yet can be cancelled");
    await EsimReferralCommission.updateOne({ _id: id, status: "pending" }, { $set: { status: "cancelled", note: note.slice(0, 300) || "Cancelled by an admin" } });
  } else {
    if (!commission.clawback || commission.clawback.settled) throw new CommissionActionError("Nothing to take back on this reward");
    await EsimReferralCommission.updateOne({ _id: id }, { $set: { "clawback.settled": true, note: note.slice(0, 300) || "Dealt with by hand" } });
  }
  return { id };
}
