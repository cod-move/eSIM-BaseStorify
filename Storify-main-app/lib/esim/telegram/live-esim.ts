import "server-only";

import { mongoose } from "@/lib/db";
import { Order } from "@/models";
import { EsimProfile } from "@/models/esim-profile.model";
import { ownerFilter } from "@/lib/esim/account/esims";
import { REWARD_PAYMENT_METHOD } from "@/lib/esim/telegram/redeem";

/**
 * Whether a shopper has an eSIM in use, for the check-in limit: one issued,
 * not expired, used up or cancelled (ready to install, installed or in use),
 * and bought — an eSIM exchanged for check-in data does not count, or the
 * free data would lift its own limit.
 */
export async function hasLiveEsim(userId: string, now = new Date()): Promise<boolean> {
  const profiles = await EsimProfile.find({
    ...(await ownerFilter(userId)),
    status: "fulfilled",
    "lifecycle.status": { $in: [null, "not_installed", "installed", "in_use"] },
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
  })
    .select({ order: 1 })
    .limit(50)
    .lean<Array<{ order: mongoose.Types.ObjectId }>>();
  if (!profiles.length) return false;
  const orders = [...new Set(profiles.map((profile) => String(profile.order)))].map((id) => new mongoose.Types.ObjectId(id));
  return Boolean(await Order.exists({ _id: { $in: orders }, paymentMethod: { $ne: REWARD_PAYMENT_METHOD } }));
}
