import "server-only";

import { mongoose } from "@/lib/db";
import { Coupon, User } from "@/models";
import { EsimReferral, EsimReferralCommission } from "@/models/esim-referral.model";
import { EsimRewardEntry } from "@/models/esim-telegram.model";
import type { ReferralDataReward } from "@/lib/esim/referral/rules";
import { appBaseUrl } from "@/lib/app-url";
import { ensureReferralCode, getReferrerSettings } from "@/lib/esim/referral/service";
import type { CommissionStatus } from "@/models/esim-referral.model";

/**
 * The shopper's referral centre (REF-05): their code and link, what the
 * store gives for a referral, the people they invited (emails shown in part
 * only) and every reward.
 */

/** "j***@example.com" — enough to recognise a friend, not enough to collect addresses. */
export function maskEmail(email: string | null | undefined): string {
  const [name, domain] = String(email ?? "").split("@");
  if (!name || !domain) return "—";
  return `${name.slice(0, 1)}***@${domain}`;
}

export interface ReferralCentre {
  enabled: boolean;
  code: string;
  link: string;
  offer: { rewardType: "credit" | "data"; data: ReferralDataReward; commissionType: "percent" | "fixed"; commissionValue: number; orderLimit: number; validityDays: number; coupon: { enabled: boolean; type: "percentage" | "fixed"; value: number } };
  /** `dataMb`: data this friend earned the shopper (rewardType "data"). */
  invited: Array<{ id: string; who: string; joinedAt: Date; rewards: number; dataMb: number }>;
  /** Data earned for inviting, all friends together. */
  dataEarnedMb: number;
  /** What this shopper got for joining through a friend's link: who invited them, and the data given (0 until given). */
  received: { from: string; joinedAt: Date; dataMb: number; dataAt: Date | null; pendingMb: number } | null;
  rewards: Array<{ id: string; orderNumber: string; amount: number; currency: string; status: CommissionStatus; payableAt: Date; creditedAt: Date | null; createdAt: Date }>;
  totals: { paid: number; pending: number };
  /** The welcome coupon this shopper got for joining with a friend's link (REF-06); null if none. */
  welcomeCoupon: { code: string; type: "percentage" | "fixed"; value: number; minOrder: number; endsAt: Date | null; active: boolean } | null;
}

async function welcomeCouponOf(userId: string): Promise<ReferralCentre["welcomeCoupon"]> {
  const joined = await EsimReferral.findOne({ referee: new mongoose.Types.ObjectId(userId), couponCode: { $ne: null } })
    .select({ couponCode: 1 })
    .lean<{ couponCode: string | null }>();
  if (!joined?.couponCode) return null;
  const coupon = await Coupon.findOne({ code: joined.couponCode })
    .select({ code: 1, type: 1, value: 1, minOrderAmount: 1, endDate: 1, usedCount: 1, usageLimit: 1, status: 1 })
    .lean<{ code: string; type: string; value: number; minOrderAmount?: number; endDate?: Date; usedCount?: number; usageLimit?: number; status?: string }>();
  if (!coupon) return null;
  const used = Boolean(coupon.usageLimit && (coupon.usedCount ?? 0) >= coupon.usageLimit);
  const expired = coupon.endDate ? new Date(coupon.endDate).getTime() < Date.now() : false;
  return {
    code: coupon.code,
    type: coupon.type === "fixed" ? "fixed" : "percentage",
    value: Number(coupon.value) || 0,
    minOrder: Number(coupon.minOrderAmount) || 0,
    endsAt: coupon.endDate ?? null,
    active: !used && !expired && coupon.status === "active",
  };
}

export async function referralCentre(userId: string): Promise<ReferralCentre> {
  // The shopper's own rules (REF-07) where an admin set them, so the centre shows what they really earn.
  const settings = await getReferrerSettings(userId);
  const code = await ensureReferralCode(userId);
  const referrer = new mongoose.Types.ObjectId(userId);
  const [referrals, commissions, welcomeCoupon, dataRows, joined] = await Promise.all([
    EsimReferral.find({ referrer }).sort({ createdAt: -1 }).limit(200).lean(),
    EsimReferralCommission.find({ referrer }).sort({ createdAt: -1 }).limit(200).lean(),
    welcomeCouponOf(userId),
    EsimRewardEntry.find({ user: referrer, kind: { $in: ["referral", "invited"] } }).select({ kind: 1, mb: 1, referral: 1, createdAt: 1 }).lean(),
    EsimReferral.findOne({ referee: referrer }).lean(),
  ]);
  const dataByReferral = new Map(dataRows.filter((row) => row.kind === "referral").map((row) => [String(row.referral), row.mb]));
  const invitedRow = dataRows.find((row) => row.kind === "invited");
  const inviter = joined ? await User.findById(joined.referrer).select({ email: 1 }).lean<{ email?: string } | null>() : null;
  // Data still to come for joining: the inviter's rules give it on the first order, which has not come yet.
  const inviterRules = joined && !invitedRow ? await getReferrerSettings(joined.referrer) : null;
  const pendingMb =
    inviterRules?.enabled && inviterRules.rewardType === "data" && inviterRules.data.inviteeOn === "first_order" ? inviterRules.data.inviteeMb : 0;
  const users = await User.find({ _id: { $in: referrals.map((referral) => referral.referee) } })
    .select({ email: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; email?: string }>>();
  const emailById = new Map(users.map((user) => [String(user._id), user.email]));
  const rewardsByReferee = new Map<string, number>();
  for (const commission of commissions) {
    if (commission.status === "cancelled") continue;
    const key = String(commission.referee);
    rewardsByReferee.set(key, (rewardsByReferee.get(key) ?? 0) + commission.amount);
  }
  const sum = (status: CommissionStatus) =>
    Math.round(commissions.filter((entry) => entry.status === status).reduce((total, entry) => total + entry.amount, 0) * 100) / 100;
  return {
    enabled: settings.enabled,
    code,
    link: `${appBaseUrl()}/?ref=${code}`,
    offer: {
      rewardType: settings.rewardType,
      data: { ...settings.data },
      commissionType: settings.commissionType,
      commissionValue: settings.commissionValue,
      orderLimit: settings.orderLimit,
      validityDays: settings.validityDays,
      coupon: { enabled: settings.coupon.enabled, type: settings.coupon.type, value: settings.coupon.value },
    },
    invited: referrals.map((referral) => ({
      id: String(referral._id),
      who: maskEmail(emailById.get(String(referral.referee))),
      joinedAt: referral.createdAt,
      rewards: Math.round((rewardsByReferee.get(String(referral.referee)) ?? 0) * 100) / 100,
      dataMb: dataByReferral.get(String(referral._id)) ?? 0,
    })),
    dataEarnedMb: [...dataByReferral.values()].reduce((total, mb) => total + mb, 0),
    received: joined
      ? { from: maskEmail(inviter?.email), joinedAt: joined.createdAt, dataMb: invitedRow?.mb ?? 0, dataAt: invitedRow?.createdAt ?? null, pendingMb }
      : null,
    rewards: commissions.map((commission) => ({
      id: String(commission._id),
      orderNumber: commission.orderNumber,
      amount: commission.amount,
      currency: commission.currency,
      status: commission.status,
      payableAt: commission.payableAt,
      creditedAt: commission.creditedAt,
      createdAt: commission.createdAt,
    })),
    totals: { paid: sum("credited"), pending: sum("pending") },
    welcomeCoupon,
  };
}
