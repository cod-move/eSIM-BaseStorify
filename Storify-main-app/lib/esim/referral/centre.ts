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
  invited: FriendRow[];
  /** Everyone who joined with the shopper's link, and the pages `invited` is one of. */
  invitedTotal: number;
  invitedPage: number;
  invitedTotalPages: number;
  /** Data earned for inviting, all friends together. */
  dataEarnedMb: number;
  /** What this shopper got for joining through a friend's link: who invited them, and the data given (0 until given). */
  received: { from: string; joinedAt: Date; dataMb: number; dataAt: Date | null; pendingMb: number } | null;
  rewards: Array<{ id: string; orderNumber: string; amount: number; currency: string; status: CommissionStatus; payableAt: Date; creditedAt: Date | null; createdAt: Date }>;
  /** Data given for inviting (rewardType "data"), in the same window as `rewards`: for whom, and when. */
  dataRewards: Array<{ id: string; mb: number; who: string; createdAt: Date }>;
  /** From when `rewards` and `dataRewards` are listed; null = all of them. */
  rewardsSince: Date | null;
  /** Rewards of either kind ever, so the page can say there are older ones. */
  rewardsEver: number;
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

/** A friend who joined: shown in part, when, and what they earned the shopper (money and data). */
export interface FriendRow {
  id: string;
  who: string;
  joinedAt: Date;
  rewards: number;
  dataMb: number;
}

export const FRIENDS_PER_PAGE = 20;

/**
 * The friends who joined with the shopper's link, newest first, a page at a
 * time (a busy referrer has thousands), with what each earned them: their
 * commissions not cancelled, and the data given for them.
 */
export async function referralFriends(userId: string, page = 1, perPage = FRIENDS_PER_PAGE): Promise<{ items: FriendRow[]; page: number; totalPages: number; total: number }> {
  const referrer = new mongoose.Types.ObjectId(userId);
  const total = await EsimReferral.countDocuments({ referrer });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const referrals = await EsimReferral.find({ referrer })
    .sort({ createdAt: -1, _id: -1 })
    .skip((current - 1) * perPage)
    .limit(perPage)
    .lean();
  const referees = referrals.map((referral) => referral.referee);
  const [users, earned, data] = await Promise.all([
    User.find({ _id: { $in: referees } }).select({ email: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; email?: string }>>(),
    EsimReferralCommission.aggregate<{ _id: mongoose.Types.ObjectId; amount: number }>([
      { $match: { referrer, referee: { $in: referees }, status: { $ne: "cancelled" } } },
      { $group: { _id: "$referee", amount: { $sum: "$amount" } } },
    ]),
    EsimRewardEntry.find({ user: referrer, kind: "referral", referral: { $in: referrals.map((referral) => referral._id) } })
      .select({ mb: 1, referral: 1 })
      .lean(),
  ]);
  const emailById = new Map(users.map((user) => [String(user._id), user.email]));
  const earnedBy = new Map(earned.map((row) => [String(row._id), row.amount]));
  const dataBy = new Map(data.map((row) => [String(row.referral), row.mb]));
  return {
    items: referrals.map((referral) => ({
      id: String(referral._id),
      who: maskEmail(emailById.get(String(referral.referee))),
      joinedAt: referral.createdAt,
      rewards: Math.round((earnedBy.get(String(referral.referee)) ?? 0) * 100) / 100,
      dataMb: dataBy.get(String(referral._id)) ?? 0,
    })),
    page: current,
    totalPages,
    total,
  };
}

/** The rewards listed in the centre (the totals count them all). */
const REWARDS_SHOWN = 100;

/** How far back the centre lists rewards unless asked for all of them. */
export const REWARDS_RECENT_DAYS = 30;

/**
 * `rewardsSince`: list rewards from then on; null for all; left out, the
 * last REWARDS_RECENT_DAYS days.
 */
export async function referralCentre(userId: string, options: { friendsPage?: number; rewardsSince?: Date | null } = {}): Promise<ReferralCentre> {
  const since = options.rewardsSince === undefined ? new Date(Date.now() - REWARDS_RECENT_DAYS * 86_400_000) : options.rewardsSince;
  const after = since ? { createdAt: { $gte: since } } : {};
  // The shopper's own rules (REF-07) where an admin set them, so the centre shows what they really earn.
  const settings = await getReferrerSettings(userId);
  const code = await ensureReferralCode(userId);
  const referrer = new mongoose.Types.ObjectId(userId);
  const [friends, commissions, totals, welcomeCoupon, dataEarned, invitedRow, joined] = await Promise.all([
    referralFriends(userId, options.friendsPage ?? 1),
    EsimReferralCommission.find({ referrer, ...after }).sort({ createdAt: -1 }).limit(REWARDS_SHOWN).lean(),
    EsimReferralCommission.aggregate<{ _id: CommissionStatus; amount: number }>([
      { $match: { referrer, status: { $in: ["credited", "pending"] } } },
      { $group: { _id: "$status", amount: { $sum: "$amount" } } },
    ]),
    welcomeCouponOf(userId),
    EsimRewardEntry.aggregate<{ mb: number }>([{ $match: { user: referrer, kind: "referral" } }, { $group: { _id: null, mb: { $sum: "$mb" } } }]),
    EsimRewardEntry.findOne({ user: referrer, kind: "invited" }).select({ mb: 1, createdAt: 1 }).lean(),
    EsimReferral.findOne({ referee: referrer }).lean(),
  ]);
  const [dataRows, commissionsEver, dataEver] = await Promise.all([
    EsimRewardEntry.find({ user: referrer, kind: "referral", ...after }).sort({ createdAt: -1 }).limit(REWARDS_SHOWN).select({ mb: 1, referral: 1, createdAt: 1 }).lean(),
    EsimReferralCommission.countDocuments({ referrer }),
    EsimRewardEntry.countDocuments({ user: referrer, kind: "referral" }),
  ]);
  const dataReferralIds = dataRows.map((row) => row.referral).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
  const dataReferrals = await EsimReferral.find({ _id: { $in: dataReferralIds } })
    .select({ referee: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; referee: mongoose.Types.ObjectId }>>();
  const dataReferees = await User.find({ _id: { $in: dataReferrals.map((row) => row.referee) } })
    .select({ email: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; email?: string }>>();
  const refereeOf = new Map(dataReferrals.map((row) => [String(row._id), String(row.referee)]));
  const emailOf = new Map(dataReferees.map((row) => [String(row._id), row.email]));
  const inviter = joined ? await User.findById(joined.referrer).select({ email: 1 }).lean<{ email?: string } | null>() : null;
  // Data still to come for joining: the inviter's rules give it on the first order, which has not come yet.
  const inviterRules = joined && !invitedRow ? await getReferrerSettings(joined.referrer) : null;
  const pendingMb =
    inviterRules?.enabled && inviterRules.rewardType === "data" && inviterRules.data.inviteeOn === "first_order" ? inviterRules.data.inviteeMb : 0;
  const sum = (status: CommissionStatus) => Math.round((totals.find((row) => row._id === status)?.amount ?? 0) * 100) / 100;
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
    invited: friends.items,
    invitedTotal: friends.total,
    invitedPage: friends.page,
    invitedTotalPages: friends.totalPages,
    dataEarnedMb: dataEarned[0]?.mb ?? 0,
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
    dataRewards: dataRows.map((row) => ({
      id: String(row._id),
      mb: row.mb,
      who: maskEmail(emailOf.get(refereeOf.get(String(row.referral)) ?? "")),
      createdAt: row.createdAt,
    })),
    rewardsSince: since,
    rewardsEver: commissionsEver + dataEver,
    totals: { paid: sum("credited"), pending: sum("pending") },
    welcomeCoupon,
  };
}
