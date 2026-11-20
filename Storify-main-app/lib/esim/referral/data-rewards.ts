import "server-only";

import { createNotification } from "@/lib/notifications/notifications";
import { NotificationType } from "@/models/notification.model";
import type { IEsimReferral } from "@/models/esim-referral.model";
import { dataRewardsAt, type DataRewardTrigger } from "@/lib/esim/referral/rules";
import { getReferrerSettings } from "@/lib/esim/referral/service";
import { grantRewardData } from "@/lib/esim/telegram/service";
import { formatMb } from "@/lib/esim/telegram/format";

/**
 * Referral rewards given as data (rewardType "data", 二选一 with the balance
 * commission): the referrer once per friend, the friend once, each at the
 * moment the rules name — the friend's sign-up, or their first order
 * delivered. The data goes on the shopper's data balance (the welfare
 * centre's), keyed by the referral, so a retried hook gives it once.
 */

type ReferralLike = Pick<IEsimReferral, "_id" | "referrer" | "referee" | "validUntil">;

async function tell(userId: string, title: string, message: string, key: string) {
  await createNotification({
    userId,
    type: NotificationType.STORE_CREDIT,
    title,
    message,
    link: "/account/esims/rewards",
    data: { esimRewardKey: key },
    dedupe: { type: NotificationType.STORE_CREDIT, "data.esimRewardKey": key },
  }).catch(console.error);
}

/** Gives the data rewards due at this moment for a referral; answers what was given. */
export async function giveReferralData(referral: ReferralLike, trigger: DataRewardTrigger, at = new Date()): Promise<{ referrerMb: number; inviteeMb: number }> {
  const settings = await getReferrerSettings(referral.referrer);
  const referralId = String(referral._id);
  const due = dataRewardsAt(trigger, { referralId, validUntil: referral.validUntil, at }, settings);
  const given = { referrerMb: 0, inviteeMb: 0 };
  if (due.referrerMb > 0) {
    const key = `referral:${referralId}`;
    if (await grantRewardData({ userId: String(referral.referrer), mb: due.referrerMb, kind: "referral", key, referralId })) {
      given.referrerMb = due.referrerMb;
      await tell(String(referral.referrer), "Referral reward added", `${formatMb(due.referrerMb)} of data was added for a friend you invited.`, key);
    }
  }
  if (due.inviteeMb > 0) {
    const key = `invited:${referralId}`;
    if (await grantRewardData({ userId: String(referral.referee), mb: due.inviteeMb, kind: "invited", key, referralId })) {
      given.inviteeMb = due.inviteeMb;
      await tell(String(referral.referee), "Welcome data added", `${formatMb(due.inviteeMb)} of data was added for joining through a friend's invite.`, key);
    }
  }
  return given;
}
