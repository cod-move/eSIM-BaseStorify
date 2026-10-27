import "server-only";

import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimReferral, EsimReferralCommission } from "@/models/esim-referral.model";
import { appBaseUrl } from "@/lib/app-url";
import { ensureReferralCode, getReferralSettings } from "@/lib/esim/referral/service";
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
  offer: { commissionType: "percent" | "fixed"; commissionValue: number; orderLimit: number; validityDays: number; coupon: { enabled: boolean; type: "percentage" | "fixed"; value: number } };
  invited: Array<{ id: string; who: string; joinedAt: Date; rewards: number }>;
  rewards: Array<{ id: string; orderNumber: string; amount: number; currency: string; status: CommissionStatus; payableAt: Date; creditedAt: Date | null; createdAt: Date }>;
  totals: { paid: number; pending: number };
}

export async function referralCentre(userId: string): Promise<ReferralCentre> {
  const settings = await getReferralSettings();
  const code = await ensureReferralCode(userId);
  const referrer = new mongoose.Types.ObjectId(userId);
  const [referrals, commissions] = await Promise.all([
    EsimReferral.find({ referrer }).sort({ createdAt: -1 }).limit(200).lean(),
    EsimReferralCommission.find({ referrer }).sort({ createdAt: -1 }).limit(200).lean(),
  ]);
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
    link: `${appBaseUrl()}/esim/invite/${code}`,
    offer: {
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
    })),
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
  };
}
