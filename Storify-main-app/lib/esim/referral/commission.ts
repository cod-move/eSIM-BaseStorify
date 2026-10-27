import "server-only";

import { mongoose } from "@/lib/db";
import { ORDER_STATUS } from "@/config/app.config";
import { Order, User } from "@/models";
import { NotificationType } from "@/models/notification.model";
import { EsimReferral, EsimReferralCommission, type IEsimReferralCommission } from "@/models/esim-referral.model";
import { issueStoreCredit } from "@/lib/store-credit/store-credit";
import { createNotification, notifyAdminsPaymentAnomaly } from "@/lib/notifications/notifications";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { appBaseUrl } from "@/lib/app-url";
import { commissionAllowed, commissionBase, commissionFor } from "@/lib/esim/referral/rules";
import { getReferralSettings } from "@/lib/esim/referral/service";

/**
 * Referral commission (REF-02/03/04).
 *
 * Earned when a referee's order is delivered (all its eSIMs issued, top-ups
 * done), on what the order paid less refunds and wallet top-ups. Paid as
 * store credit after the holding period — booked by Storify as a promotion
 * the store pays for (source `goodwill`), which is what a referral reward
 * is. Refunded before then, the commission shrinks or is cancelled. Store
 * credit cannot be taken back, so a refund after payment marks what should
 * be taken back by hand and tells the admins.
 */

type OrderView = {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  status: string;
  customerId?: unknown;
  guestEmail?: string | null;
  currency?: string;
  total?: number;
  refundedTotal?: number;
  tax?: number;
  shippingCost?: number;
  customs?: { dutyAmount?: number | null } | null;
  items: Array<{ price?: number; quantity?: number; lineAttributes?: unknown }>;
  createdAt: Date;
};

const ORDER_FIELDS = { orderNumber: 1, status: 1, customerId: 1, guestEmail: 1, currency: 1, total: 1, refundedTotal: 1, tax: 1, shippingCost: 1, customs: 1, items: 1, createdAt: 1 };

/** The commission a delivered order earns, if it is a referee's; idempotent per order. */
export async function earnReferralCommission(orderId: unknown): Promise<IEsimReferralCommission | null> {
  if (!mongoose.isValidObjectId(orderId)) return null;
  const id = new mongoose.Types.ObjectId(String(orderId));
  if (await EsimReferralCommission.exists({ order: id })) return null;
  const order = await Order.findById(orderId).select(ORDER_FIELDS).lean<OrderView | null>();
  if (!order || order.guestEmail || !mongoose.isValidObjectId(order.customerId) || order.status === ORDER_STATUS.CANCELLED) return null;
  const referral = await EsimReferral.findOne({ referee: new mongoose.Types.ObjectId(String(order.customerId)) }).lean();
  if (!referral) return null;
  const settings = await getReferralSettings();
  const earnedSoFar = await EsimReferralCommission.countDocuments({ referral: referral._id, status: { $ne: "cancelled" } });
  if (!commissionAllowed({ validUntil: referral.validUntil, orderDate: order.createdAt, earnedSoFar }, settings).ok) return null;
  const base = commissionBase(order);
  const amount = commissionFor(base, settings);
  if (!(amount > 0)) return null;
  try {
    return await EsimReferralCommission.create({
      referral: referral._id,
      referrer: referral.referrer,
      referee: referral.referee,
      order: order._id,
      orderNumber: order.orderNumber,
      base,
      amount,
      currency: String(order.currency || "USD").toUpperCase(),
      payableAt: new Date(Date.now() + settings.holdDays * 86_400_000),
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return null;
    throw error;
  }
}

async function tellReferrer(commission: IEsimReferralCommission, amount: number) {
  const formatted = new Intl.NumberFormat("en", { style: "currency", currency: commission.currency }).format(amount);
  const userId = String(commission.referrer);
  await createNotification({
    userId,
    type: NotificationType.STORE_CREDIT,
    title: "Referral reward added",
    message: `${formatted} was added to your balance for an order by someone you invited.`,
    link: "/account/esims/referrals",
    data: { esimReferralCommission: String(commission._id) },
    dedupe: { type: NotificationType.STORE_CREDIT, "data.esimReferralCommission": String(commission._id) },
  }).catch(console.error);
  const user = await User.findById(userId).select({ email: 1 }).lean<{ email?: string } | null>();
  if (user?.email) {
    await sendEmail({
      to: user.email,
      subject: `${formatted} referral reward added to your balance`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
        <h2>Thanks for the referral</h2>
        <p>Someone you invited completed an order, so <b>${escapeHtml(formatted)}</b> was added to your balance. It is used at checkout for eSIMs and top-ups.</p>
        <p><a href="${escapeHtml(`${appBaseUrl()}/account/esims/referrals`)}">See my referrals</a></p>
      </div>`,
      category: "esim-referral",
      dedupeKey: `esim-referral-paid:${commission._id}`,
    }).catch(console.error);
  }
}

export interface PayoutResult {
  paid: number;
  cancelled: number;
  clawbacks: number;
}

/**
 * Pays the commissions whose holding period is over, cancels the ones whose
 * order was refunded meanwhile, and marks a refund after payment as a
 * claw-back for a person. The usage cron runs it.
 */
export async function runReferralPayouts(options: { now?: Date; limit?: number } = {}): Promise<PayoutResult> {
  const now = options.now ?? new Date();
  const result: PayoutResult = { paid: 0, cancelled: 0, clawbacks: 0 };
  const settings = await getReferralSettings();

  const due = await EsimReferralCommission.find({ status: "pending", payableAt: { $lte: now } }).sort({ payableAt: 1 }).limit(options.limit ?? 200);
  for (const commission of due) {
    const order = await Order.findById(commission.order).select(ORDER_FIELDS).lean<OrderView | null>();
    const amount = order && order.status !== ORDER_STATUS.CANCELLED
      ? Math.min(commission.amount, commissionFor(commissionBase(order), settings))
      : 0;
    if (!(amount > 0)) {
      const moved = await EsimReferralCommission.updateOne({ _id: commission._id, status: "pending" }, { $set: { status: "cancelled", note: "The order was refunded or cancelled before the reward was paid" } });
      result.cancelled += moved.modifiedCount;
      continue;
    }
    // Claimed before the money moves, so two runs cannot pay it twice; the credit itself is idempotent too.
    const claimed = await EsimReferralCommission.updateOne({ _id: commission._id, status: "pending" }, { $set: { status: "credited", amount, creditedAt: now } });
    if (!claimed.modifiedCount) continue;
    await issueStoreCredit({
      customerId: String(commission.referrer),
      currency: commission.currency,
      amount,
      source: "goodwill",
      orderId: commission.order,
      note: `Referral reward, order ${commission.orderNumber}`,
      createdBy: "esim-referral",
      idempotencyKey: `esim-referral:${commission._id}`,
    });
    await tellReferrer(commission, amount);
    result.paid += 1;
  }

  // Paid, then refunded: what the order now earns is less than what was paid.
  const credited = await EsimReferralCommission.find({ status: "credited", clawback: null, creditedAt: { $gte: new Date(now.getTime() - 180 * 86_400_000) } })
    .select({ order: 1, amount: 1, orderNumber: 1, referrer: 1, currency: 1 })
    .limit(500)
    .lean();
  if (credited.length) {
    const orders = await Order.find({ _id: { $in: credited.map((entry) => entry.order) }, refundedTotal: { $gt: 0 } }).select(ORDER_FIELDS).lean<OrderView[]>();
    const byId = new Map(orders.map((order) => [String(order._id), order]));
    for (const commission of credited) {
      const order = byId.get(String(commission.order));
      if (!order) continue;
      const owed = Math.round((commission.amount - commissionFor(commissionBase(order), settings)) * 100) / 100;
      if (!(owed > 0)) continue;
      const marked = await EsimReferralCommission.updateOne({ _id: commission._id, clawback: null }, { $set: { clawback: { amount: owed, at: now, settled: false } } });
      if (!marked.modifiedCount) continue;
      result.clawbacks += 1;
      await notifyAdminsPaymentAnomaly({
        title: "Referral reward to take back",
        message: `Order ${commission.orderNumber} was refunded after its referral reward was paid. Take ${owed.toFixed(2)} ${commission.currency} back from the referrer's balance by hand, or let it stand.`,
        dedupeKey: `esim-referral-clawback:${commission._id}`,
        link: "/admin/esim/referrals",
      }).catch(console.error);
    }
  }
  return result;
}
