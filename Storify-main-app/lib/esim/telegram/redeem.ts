import "server-only";

import { mongoose } from "@/lib/db";
import { runTransaction } from "@/lib/db-transaction";
import { User } from "@/models";
import { getSettings } from "@/models/settings.model";
import { EsimRewardAccount, EsimRewardEntry, getTelegramSettings } from "@/models/esim-telegram.model";
import type { AuditContext } from "@/lib/audit";
import { createAdminOrder, resolveAdminOrderLines } from "@/lib/orders/create-admin-order";
import { esimStandInAddress } from "@/lib/esim/checkout/address";

/**
 * Spending saved-up check-in data on an eSIM. The data comes off the balance
 * first, in a transaction with its ledger row (keyed by the request id, so a
 * retried tap spends once); then a paid order at no charge is made for the
 * item's eSIM variant, and the eSIM is issued as any paid order's is (the
 * caller runs fulfilment after the response; the fulfilment cron sweeps paid
 * orders too). An order that cannot be made gives the data back.
 */

export const REWARD_PAYMENT_METHOD = "esim_reward";

export type RedeemResult =
  | { ok: true; orderId: string; orderNumber: string; balanceMb: number }
  | { ok: false; reason: "disabled" | "no_item" | "not_enough" | "failed" };

class NotEnough extends Error {}

const isDuplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

export async function redeemReward(input: { userId: string; itemId: string; requestId: string; audit: AuditContext }): Promise<RedeemResult> {
  const settings = await getTelegramSettings();
  if (!settings.enabled) return { ok: false, reason: "disabled" };
  const item = settings.items.find((entry) => String(entry._id) === input.itemId && entry.enabled);
  if (!item) return { ok: false, reason: "no_item" };
  const user = new mongoose.Types.ObjectId(input.userId);
  const key = `redeem:${input.userId}:${input.requestId}`;

  // A retried request: answer what the first one did.
  const earlier = await EsimRewardEntry.findOne({ key }).lean();
  if (earlier) {
    const account = await EsimRewardAccount.findOne({ user }).lean();
    if (earlier.status === "done" && earlier.order) {
      return { ok: true, orderId: String(earlier.order), orderNumber: earlier.orderNumber ?? "", balanceMb: account?.balanceMb ?? 0 };
    }
    return { ok: false, reason: "failed" };
  }

  let entryId: mongoose.Types.ObjectId;
  try {
    entryId = await runTransaction("esim-telegram-redeem", async (session) => {
      const account = await EsimRewardAccount.findOneAndUpdate(
        { user, balanceMb: { $gte: item.costMb } },
        { $inc: { balanceMb: -item.costMb, spentMb: item.costMb } },
        { session, returnDocument: "after" },
      ).lean();
      if (!account) throw new NotEnough();
      const [entry] = await EsimRewardEntry.create(
        [{ user, kind: "redeem", mb: -item.costMb, key, itemId: item._id, itemName: item.name, status: "pending" }],
        { session },
      );
      return entry._id as mongoose.Types.ObjectId;
    });
  } catch (error) {
    if (error instanceof NotEnough) return { ok: false, reason: "not_enough" };
    if (isDuplicate(error)) return redeemReward(input);
    throw error;
  }

  try {
    const shopper = await User.findById(user).select({ name: 1, email: 1, phone: 1 }).lean<{ name?: string; email?: string; phone?: string } | null>();
    const address = esimStandInAddress({ name: shopper?.name, email: shopper?.email, phone: shopper?.phone });
    const lines = await resolveAdminOrderLines([{ productId: String(item.productId), variantId: String(item.variantId), quantity: 1, price: 0 }]);
    const order = await createAdminOrder({
      settings: await getSettings(),
      lines,
      customerId: input.userId,
      shippingAddress: { ...address },
      shippingCost: 0,
      discount: 0,
      taxRate: 0,
      paymentMethod: REWARD_PAYMENT_METHOD,
      paymentStatus: "paid",
      notes: `Telegram check-in reward: ${item.costMb} MB`,
      actorId: input.userId,
      audit: input.audit,
      extra: { esimReward: { entry: entryId, costMb: item.costMb } },
    });
    await EsimRewardEntry.updateOne({ _id: entryId }, { $set: { status: "done", order: order._id, orderNumber: order.orderNumber } });
    const account = await EsimRewardAccount.findOne({ user }).lean();
    return { ok: true, orderId: String(order._id), orderNumber: order.orderNumber, balanceMb: account?.balanceMb ?? 0 };
  } catch (error) {
    console.error("Telegram reward: the order could not be made, giving the data back:", error);
    await refundRedemption(entryId).catch((refundError) => console.error("Telegram reward: refund failed:", refundError));
    return { ok: false, reason: "failed" };
  }
}

/** Gives a redemption's data back once (keyed by the redemption), and marks it failed. */
export async function refundRedemption(entryId: mongoose.Types.ObjectId | string, note = "Order could not be made") {
  const entry = await EsimRewardEntry.findById(entryId).lean();
  if (!entry || entry.kind !== "redeem") return false;
  try {
    await runTransaction("esim-telegram-refund", async (session) => {
      await EsimRewardEntry.create(
        [{ user: entry.user, kind: "refund", mb: -entry.mb, key: `refund:${entry._id}`, itemId: entry.itemId, itemName: entry.itemName, order: entry.order, orderNumber: entry.orderNumber, note, status: "done" }],
        { session },
      );
      await EsimRewardAccount.updateOne({ user: entry.user }, { $inc: { balanceMb: -entry.mb, spentMb: entry.mb } }, { session });
      await EsimRewardEntry.updateOne({ _id: entry._id }, { $set: { status: "failed" } }, { session });
    });
    return true;
  } catch (error) {
    if (isDuplicate(error)) return false;
    throw error;
  }
}
