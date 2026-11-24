import "server-only";

import * as z from "zod";
import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimReferral, EsimReferralCommission, EsimReferralOverride } from "@/models/esim-referral.model";
import { getReferralSettings } from "@/lib/esim/referral/service";

/**
 * Admin → eSIM → Referrals (REF-02..04): the referral settings, and every
 * reward with who earned it, for which order and where it stands —
 * including rewards to take back by hand after a late refund.
 */

export const ReferralSettingsSchema = z.object({
  enabled: z.boolean(),
  rewardType: z.enum(["credit", "data"]).default("credit"),
  data: z
    .object({
      referrerMb: z.number().int().min(0).max(10_000_000),
      referrerOn: z.enum(["signup", "first_order"]),
      inviteeMb: z.number().int().min(0).max(10_000_000),
      inviteeOn: z.enum(["signup", "first_order"]),
    })
    .default({ referrerMb: 1024, referrerOn: "first_order", inviteeMb: 500, inviteeOn: "first_order" }),
  commissionType: z.enum(["percent", "fixed"]),
  commissionValue: z.number().min(0).max(100_000),
  validityDays: z.number().int().min(0).max(3650),
  orderLimit: z.number().int().min(0).max(1000),
  deductPercent: z.number().int().min(0).max(100).default(0),
  holdDays: z.number().int().min(0).max(365),
  numbers: z
    .object({
      enabled: z.boolean(),
      commissionType: z.enum(["percent", "fixed"]),
      commissionValue: z.number().min(0).max(100_000),
    })
    .default({ enabled: false, commissionType: "percent", commissionValue: 10 }),
  coupon: z.object({
    enabled: z.boolean(),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().min(0).max(100_000),
    days: z.number().int().min(1).max(365),
    minOrderMinor: z.number().int().min(0).max(100_000_000),
  }),
}).refine((value) => value.commissionType !== "percent" || value.commissionValue <= 100, { message: "A percent commission is at most 100", path: ["commissionValue"] })
  .refine((value) => value.numbers.commissionType !== "percent" || value.numbers.commissionValue <= 100, { message: "A percent commission is at most 100", path: ["numbers", "commissionValue"] })
  .refine((value) => value.coupon.type !== "percentage" || value.coupon.value <= 100, { message: "A percent discount is at most 100", path: ["coupon", "value"] });

export async function saveReferralSettings(next: z.infer<typeof ReferralSettingsSchema>) {
  await connectDB();
  const before = await getReferralSettings();
  const settings = await getEsimSettings();
  settings.referral = { ...next, data: { ...next.data }, numbers: { ...next.numbers }, coupon: { ...next.coupon } };
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

/* ---------- Per-referrer rules (REF-07) ---------- */

export const ReferralOverrideSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  enabled: z.boolean().nullable(),
  rewardType: z.enum(["credit", "data"]).nullable().default(null),
  referrerMb: z.number().int().min(0).max(10_000_000).nullable().default(null),
  referrerOn: z.enum(["signup", "first_order"]).nullable().default(null),
  inviteeMb: z.number().int().min(0).max(10_000_000).nullable().default(null),
  inviteeOn: z.enum(["signup", "first_order"]).nullable().default(null),
  commissionType: z.enum(["percent", "fixed"]).nullable(),
  /** Percent, or cents for a fixed commission. */
  commissionValue: z.number().min(0).max(100_000).nullable(),
  validityDays: z.number().int().min(0).max(3650).nullable(),
  orderLimit: z.number().int().min(0).max(1000).nullable(),
  deductPercent: z.number().int().min(0).max(100).nullable().default(null),
  numbersCommissionType: z.enum(["percent", "fixed"]).nullable().default(null),
  numbersCommissionValue: z.number().min(0).max(100_000).nullable().default(null),
  note: z.string().trim().max(300).nullable().default(null),
}).refine((value) => value.commissionValue === null || value.commissionType !== "percent" || value.commissionValue <= 100, { message: "A percent commission is at most 100", path: ["commissionValue"] })
  .refine((value) => value.commissionValue === null || value.commissionType !== null, { message: "Choose the reward type for a value of its own", path: ["commissionType"] })
  .refine((value) => value.numbersCommissionValue === null || value.numbersCommissionType !== "percent" || value.numbersCommissionValue <= 100, { message: "A percent commission is at most 100", path: ["numbersCommissionValue"] })
  .refine((value) => value.numbersCommissionValue === null || value.numbersCommissionType !== null, { message: "Choose the reward type for a value of its own", path: ["numbersCommissionType"] });

export type ReferralOverrideInput = z.infer<typeof ReferralOverrideSchema>;

export interface ReferralOverrideRow {
  userId: string;
  email: string | null;
  enabled: boolean | null;
  rewardType: "credit" | "data" | null;
  referrerMb: number | null;
  referrerOn: "signup" | "first_order" | null;
  inviteeMb: number | null;
  inviteeOn: "signup" | "first_order" | null;
  commissionType: "percent" | "fixed" | null;
  commissionValue: number | null;
  validityDays: number | null;
  orderLimit: number | null;
  deductPercent: number | null;
  numbersCommissionType: "percent" | "fixed" | null;
  numbersCommissionValue: number | null;
  note: string | null;
  referrals: number;
  updatedAt: string;
}

export async function listReferralOverrides(): Promise<ReferralOverrideRow[]> {
  await connectDB();
  const rows = await EsimReferralOverride.find({}).sort({ updatedAt: -1 }).limit(500).lean();
  const ids = rows.map((row) => row.user);
  const [users, counts] = await Promise.all([
    User.find({ _id: { $in: ids } }).select({ email: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; email?: string }>>(),
    EsimReferral.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([{ $match: { referrer: { $in: ids } } }, { $group: { _id: "$referrer", n: { $sum: 1 } } }]),
  ]);
  const email = new Map(users.map((user) => [String(user._id), user.email ?? null]));
  const count = new Map(counts.map((entry) => [String(entry._id), entry.n]));
  return rows.map((row) => ({
    userId: String(row.user),
    email: email.get(String(row.user)) ?? null,
    enabled: row.enabled ?? null,
    rewardType: row.rewardType ?? null,
    referrerMb: row.referrerMb ?? null,
    referrerOn: row.referrerOn ?? null,
    inviteeMb: row.inviteeMb ?? null,
    inviteeOn: row.inviteeOn ?? null,
    commissionType: row.commissionType ?? null,
    commissionValue: row.commissionValue ?? null,
    validityDays: row.validityDays ?? null,
    orderLimit: row.orderLimit ?? null,
    deductPercent: row.deductPercent ?? null,
    numbersCommissionType: row.numbersCommissionType ?? null,
    numbersCommissionValue: row.numbersCommissionValue ?? null,
    note: row.note ?? null,
    referrals: count.get(String(row.user)) ?? 0,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

export class ReferralOverrideError extends Error {}

const overrideFields = (row: { enabled?: unknown; rewardType?: unknown; referrerMb?: unknown; referrerOn?: unknown; inviteeMb?: unknown; inviteeOn?: unknown; commissionType?: unknown; commissionValue?: unknown; validityDays?: unknown; orderLimit?: unknown; deductPercent?: unknown; numbersCommissionType?: unknown; numbersCommissionValue?: unknown; note?: unknown } | null) =>
  row ? { enabled: row.enabled ?? null, rewardType: row.rewardType ?? null, referrerMb: row.referrerMb ?? null, referrerOn: row.referrerOn ?? null, inviteeMb: row.inviteeMb ?? null, inviteeOn: row.inviteeOn ?? null, commissionType: row.commissionType ?? null, commissionValue: row.commissionValue ?? null, validityDays: row.validityDays ?? null, orderLimit: row.orderLimit ?? null, deductPercent: row.deductPercent ?? null, numbersCommissionType: row.numbersCommissionType ?? null, numbersCommissionValue: row.numbersCommissionValue ?? null, note: row.note ?? null } : null;

/** Sets a referrer's own rules, found by email; returns what was there before for the audit log. */
export async function saveReferralOverride(input: ReferralOverrideInput, updatedBy: string | null) {
  await connectDB();
  const user = await User.findOne({ email: input.email }).select({ _id: 1, role: 1 }).lean<{ _id: mongoose.Types.ObjectId; role?: string } | null>();
  if (!user) throw new ReferralOverrideError("No account with that email");
  const before = await EsimReferralOverride.findOne({ user: user._id }).lean();
  const { email: _email, ...fields } = input;
  await EsimReferralOverride.updateOne({ user: user._id }, { $set: { ...fields, updatedBy } }, { upsert: true, runValidators: true });
  return { userId: String(user._id), before: overrideFields(before), after: fields };
}

/** Puts a referrer back on the store-wide rules. */
export async function removeReferralOverride(userId: string) {
  if (!mongoose.isValidObjectId(userId)) throw new ReferralOverrideError("Unknown account");
  await connectDB();
  const before = await EsimReferralOverride.findOneAndDelete({ user: userId }).lean();
  if (!before) throw new ReferralOverrideError("This account has no rules of its own");
  return { before: overrideFields(before) };
}
