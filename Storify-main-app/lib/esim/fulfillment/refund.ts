import "server-only";

import { mongoose } from "@/lib/db";
import { PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { PaymentTransaction } from "@/models/payment-transaction.model";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimTopup } from "@/models/esim-topup.model";
import { EsimNumberOrder } from "@/models/esim-number-order.model";
import { getOrderRefundCeiling } from "@/lib/orders/preorder-cancel-refund";
import { releaseRefundInFlightWrite, logRefundInFlightReleaseError, REFUND_IN_FLIGHT_WINDOW_MS } from "@/lib/orders/refund-in-flight";
import { settleRefundedPaymentStatus } from "@/lib/orders/refund-payment-status";
import { auditOrderRefunded, systemActor } from "@/lib/orders/audit-order";
import { notifyAdminsPaymentAnomaly } from "@/lib/notifications/notifications";
import { refundAmount } from "@/lib/esim/fulfillment/refund-amount";

/**
 * Store credit for eSIMs every supplier failed to issue (ORD-09, decided
 * 2026-10-25: refund to balance by default).
 *
 * Follows the admin order route's store-credit refund step by step
 * (app/api/admin/orders/[id]/route.ts PUT): reserve the amount on the order
 * against what it collected, stamp the refund in flight, give the credit
 * through `refundToStoreCredit` (refund row, credit lot, ledger), then settle
 * the payment status and clear the stamp — rolling the reservation back on any
 * failure. Each failed job is claimed before the money moves, so a cron re-run
 * cannot refund it twice. Failed top-ups (TOP-07) and number cards that could
 * not be handed over (NUM-05) are refunded the same way, in the same refund
 * as the order's failed eSIMs.
 *
 * Not automatic: guest orders (no account to credit; the decision is to send
 * the money back the way it came, which needs the gateway refund flow) and
 * any credit that could not be given. Both are marked `manual` and the admins
 * are told the exact amount.
 */

type OrderDoc = {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  customerId?: unknown;
  guestEmail?: string | null;
  total?: number;
  currency?: string;
  paymentStatus?: string;
  refundedTotal?: number;
  refundInFlightAt?: Date | null;
  items: Array<{ price: number; quantity: number }>;
  [key: string]: unknown;
};

export interface EsimRefundResult {
  state: "refunded" | "manual" | "nothing";
  amount: number;
  currency: string;
  reason?: string;
}

async function alreadyRefunded(orderId: mongoose.Types.ObjectId) {
  const [summary] = await PaymentTransaction.aggregate([
    { $match: { orderId, type: "refund", status: "succeeded" } },
    { $group: { _id: null, total: { $sum: "$grossAmount" } } },
  ]);
  return Number(summary?.total || 0);
}

/** Both kinds of job refunded here share the fields this file reads and writes. */
const JOB_MODELS = [EsimFulfillment, EsimTopup, EsimNumberOrder] as unknown as Array<typeof EsimFulfillment>;

async function updateJobs(filter: Record<string, unknown>, update: Record<string, unknown>) {
  for (const model of JOB_MODELS) await model.updateMany(filter, update);
}

async function findJobs(filter: Record<string, unknown>) {
  const found = await Promise.all(JOB_MODELS.map((model) => model.find(filter).select({ _id: 1, lineIndex: 1 }).lean()));
  return found.flat();
}

async function markManual(jobIds: mongoose.Types.ObjectId[], amount: number, note: string, order: OrderDoc, currency: string) {
  await updateJobs({ _id: { $in: jobIds } }, { $set: { refund: { state: "manual", amount, at: new Date(), note } } });
  await notifyAdminsPaymentAnomaly({
    title: "Refund an eSIM by hand",
    message: `Order ${order.orderNumber}: ${jobIds.length} eSIM(s) or top-up(s) could not be made. Refund ${amount.toFixed(2)} ${currency} to the shopper — ${note}`,
    dedupeKey: `esim-refund-manual:${order._id}`,
  }).catch(console.error);
}

export async function refundFailedEsims(orderId: string): Promise<EsimRefundResult> {
  const order = await Order.findById(orderId).lean<OrderDoc | null>();
  if (!order) return { state: "nothing", amount: 0, currency: "USD" };
  const currency = String(order.currency || "USD").toUpperCase();

  // Claim the failed jobs nobody has refunded yet.
  const stamp = new Date();
  const candidates = await findJobs({ order: order._id, state: "failed", refund: null });
  if (!candidates.length) return { state: "nothing", amount: 0, currency };
  await updateJobs(
    { _id: { $in: candidates.map((job) => job._id) }, refund: null },
    { $set: { refund: { state: "pending", amount: 0, at: stamp } } },
  );
  const claimed = await findJobs({ order: order._id, state: "failed", "refund.state": "pending", "refund.at": stamp });
  if (!claimed.length) return { state: "nothing", amount: 0, currency };
  const jobIds = claimed.map((job) => job._id);

  const ceiling = getOrderRefundCeiling(order as unknown as Parameters<typeof getOrderRefundCeiling>[0]);
  const refunded = Number(order.refundedTotal ?? (await alreadyRefunded(order._id)));
  const amount = refundAmount({
    total: Number(order.total || 0),
    items: order.items.map((item) => ({ price: Number(item.price || 0), quantity: Number(item.quantity || 1) })),
    units: claimed.map((job) => job.lineIndex),
    refundable: Math.max(0, ceiling - refunded),
  });
  if (!(amount > 0)) {
    await updateJobs({ _id: { $in: jobIds } }, { $set: { refund: { state: "done", amount: 0, at: stamp, note: "nothing left to refund" } } });
    return { state: "nothing", amount: 0, currency };
  }

  const customerId = String(order.customerId || "");
  if (order.guestEmail || !mongoose.isValidObjectId(customerId)) {
    await markManual(jobIds, amount, "guest order: refund it to the original payment from the order screen", order, currency);
    return { state: "manual", amount, currency, reason: "guest order" };
  }

  const credited = await creditToBalance(order, amount, {
    stamp,
    refunded,
    ceiling,
    reason: "eSIM could not be issued",
    note: `eSIM for order ${order.orderNumber} could not be issued`,
    metadata: { esimFulfillmentJobs: jobIds.map(String) },
  });
  if (credited.state === "busy") {
    // Another refund is being recorded, or the room is gone: hand the jobs back for the next run.
    await updateJobs({ _id: { $in: jobIds }, "refund.at": stamp }, { $set: { refund: null } });
    return { state: "nothing", amount: 0, currency, reason: "order busy or nothing refundable" };
  }
  if (credited.state === "failed") {
    await markManual(jobIds, amount, `store credit could not be given (${credited.why.slice(0, 200)})`, order, currency);
    return { state: "manual", amount, currency, reason: credited.why };
  }
  await updateJobs({ _id: { $in: jobIds } }, { $set: { refund: { state: "done", amount, at: new Date() } } });
  return { state: "refunded", amount, currency };
}

/**
 * Store credit for part of an order, the admin order route's store-credit
 * refund step by step: reserve the amount against what the order collected,
 * stamp the refund in flight, give the credit (refund row, credit lot,
 * ledger), settle the payment status, tell the shopper, audit — rolling the
 * reservation back on any failure. Shared by the failed-eSIM refund and the
 * shopper's cancellation (USR-07). `metadata.esim` marks the refund as the
 * eSIM module's own, so the order-refund hook (P4) leaves it alone.
 */
async function creditToBalance(
  order: OrderDoc,
  amount: number,
  options: { stamp: Date; refunded: number; ceiling: number; reason: string; note: string; metadata: Record<string, unknown> },
): Promise<{ state: "done" } | { state: "busy" } | { state: "failed"; why: string }> {
  const { stamp, refunded, ceiling } = options;
  const currency = String(order.currency || "USD").toUpperCase();
  const customerId = String(order.customerId || "");
  const reservation = await Order.findOneAndUpdate(
    {
      _id: order._id,
      $or: [{ refundInFlightAt: null }, { refundInFlightAt: { $lt: new Date(Date.now() - REFUND_IN_FLIGHT_WINDOW_MS) } }],
      $expr: { $lte: [{ $add: [{ $ifNull: ["$refundedTotal", refunded] }, amount] }, ceiling + 0.01] },
    },
    [
      {
        $set: {
          refundedTotal: { $add: [{ $ifNull: ["$refundedTotal", refunded] }, amount] },
          refundInFlightAt: stamp,
        },
      },
    ],
    { returnDocument: "after" },
  ).lean<{ refundedTotal?: number } | null>();
  if (!reservation) return { state: "busy" };

  try {
    const { refundToStoreCredit } = await import("@/lib/store-credit/refund-to-credit");
    const issued = await refundToStoreCredit({
      order: { ...order, _id: String(order._id), customerId: order.customerId, channel: (order.channel as string) || "online" } as never,
      amount,
      source: "order_refund",
      reason: options.reason,
      createdBy: "system",
      metadata: { ...options.metadata, esim: true },
    });
    const refundedAfter = Number(reservation.refundedTotal ?? refunded + amount);
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentStatus: refundedAfter >= ceiling - 0.01 ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED,
        },
      },
    );
    await settleRefundedPaymentStatus({ orderId: order._id, ceiling });

    const { notifyStoreCreditIssued } = await import("@/lib/store-credit/store-credit-notify");
    await notifyStoreCreditIssued({
      customerId,
      lotId: issued.lotId,
      amount,
      currency,
      reason: "order_refund",
      note: options.note,
    }).catch((error) => console.error("Failed to tell a shopper about store credit:", error));
    const { reverseOrderLoyaltyPoints } = await import("@/lib/customers/customer");
    await reverseOrderLoyaltyPoints(String(order._id)).catch((error) =>
      console.error("Failed to reverse loyalty points on an eSIM refund:", error),
    );
    await auditOrderRefunded(systemActor(), { _id: String(order._id), orderNumber: order.orderNumber }, {
      amount,
      currency,
      reason: options.reason,
      gatewayCalled: false,
      full: refundedAfter >= ceiling - 0.01,
      storeCredit: amount,
    }).catch((error) => console.error("Failed to audit an eSIM refund:", error));
    return { state: "done" };
  } catch (error) {
    await Order.updateOne({ _id: order._id }, { $inc: { refundedTotal: -amount } }).catch((rollbackError) =>
      console.error("Failed to roll back the eSIM refund reservation:", rollbackError),
    );
    return { state: "failed", why: error instanceof Error ? error.message : String(error) };
  } finally {
    await Order.updateOne(...releaseRefundInFlightWrite(order._id, stamp)).catch(logRefundInFlightReleaseError);
  }
}

/**
 * Refunds some units of an order to the shopper's balance, less a fee
 * (USR-07). What a unit cost is its share of what the order collected, as
 * for a failed eSIM. Guests have no balance: `manual`, with the admins told.
 */
export async function refundUnitsToBalance(input: {
  orderId: string;
  lineIndexes: number[];
  feeMinor: number;
  reason: string;
  note: string;
  metadata: Record<string, unknown>;
}): Promise<EsimRefundResult & { feeMinor: number }> {
  const order = await Order.findById(input.orderId).lean<OrderDoc | null>();
  if (!order) return { state: "nothing", amount: 0, currency: "USD", feeMinor: 0 };
  const currency = String(order.currency || "USD").toUpperCase();
  const ceiling = getOrderRefundCeiling(order as unknown as Parameters<typeof getOrderRefundCeiling>[0]);
  const refunded = Number(order.refundedTotal ?? (await alreadyRefunded(order._id)));
  const paidMinor = Math.round(
    refundAmount({
      total: Number(order.total || 0),
      items: order.items.map((item) => ({ price: Number(item.price || 0), quantity: Number(item.quantity || 1) })),
      units: input.lineIndexes,
      refundable: Math.max(0, ceiling - refunded),
    }) * 100,
  );
  const feeMinor = Math.min(paidMinor, Math.max(0, Math.round(input.feeMinor)));
  const amount = (paidMinor - feeMinor) / 100;
  if (!(amount > 0)) return { state: "nothing", amount: 0, currency, feeMinor };
  const customerId = String(order.customerId || "");
  if (order.guestEmail || !mongoose.isValidObjectId(customerId)) {
    await notifyAdminsPaymentAnomaly({
      title: "Refund a cancelled eSIM by hand",
      message: `Order ${order.orderNumber}: ${input.note}. Refund ${amount.toFixed(2)} ${currency} to the original payment from the order screen.`,
      dedupeKey: `esim-cancel-manual:${order._id}:${input.lineIndexes.join(",")}`,
    }).catch(console.error);
    return { state: "manual", amount, currency, reason: "guest order", feeMinor };
  }
  const credited = await creditToBalance(order, amount, { stamp: new Date(), refunded, ceiling, reason: input.reason, note: input.note, metadata: input.metadata });
  if (credited.state === "done") return { state: "refunded", amount, currency, feeMinor };
  if (credited.state === "busy") return { state: "nothing", amount: 0, currency, reason: "order busy", feeMinor };
  return { state: "manual", amount, currency, reason: credited.why, feeMinor };
}
