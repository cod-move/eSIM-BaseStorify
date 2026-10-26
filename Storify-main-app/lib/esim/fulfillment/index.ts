import "server-only";

import type { Types } from "mongoose";
import { PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { enqueueOrderFulfillment, processFulfillmentJobs } from "@/lib/esim/fulfillment/service";
import { settleOrderDelivery } from "@/lib/esim/fulfillment/delivery";
import { EsimTopup } from "@/models/esim-topup.model";
import { enqueueOrderTopups, processTopupJobs } from "@/lib/esim/topup/service";
import { findTopupProduct } from "@/lib/esim/topup/product";

/**
 * The two ways eSIM fulfilment is driven. Payment settlement calls the first
 * (patch point P3); the `esim-fulfillment` cron calls the second every minute.
 * Both carry an order's top-ups (lib/esim/topup) along with its eSIMs.
 */

/** Queue the paid order's eSIMs and top-ups. Cheap and durable: only writes jobs. */
export async function esimQueueOrder(orderId: string): Promise<number> {
  return (await enqueueOrderFulfillment(orderId)) + (await enqueueOrderTopups(orderId));
}

/** Buy the order's queued eSIMs and make its top-ups now, then deliver if they all settled. */
export async function esimFulfilOrder(orderId: string) {
  const result = await processFulfillmentJobs({ orderId, budgetMs: 20_000 });
  const topups = await processTopupJobs({ orderId, budgetMs: 10_000 });
  // Always: a top-up can fail as it is queued (its quote gone) and still needs its refund.
  await settleOrderDelivery(orderId);
  return { ...result, topups };
}

/** How far back the cron looks for paid orders whose jobs were never queued. */
const SWEEP_WINDOW_MS = 2 * 24 * 60 * 60_000;

async function sweepUnqueuedOrders(): Promise<number> {
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
  const linked = new Set(
    (await EsimProductLink.find().select({ "variants.variantId": 1 }).lean()).flatMap((link) =>
      link.variants.map((variant) => String(variant.variantId)),
    ),
  );
  const topupProduct = await findTopupProduct();
  if (topupProduct) linked.add(topupProduct.variantId);
  if (!linked.size) return 0;
  const orders = await Order.find({ paymentStatus: PAYMENT_STATUS.PAID, updatedAt: { $gte: since } })
    .select({ "items.variantId": 1 })
    .lean<Array<{ _id: Types.ObjectId; items: Array<{ variantId?: unknown }> }>>();
  const withEsim = orders.filter((order) => order.items.some((item) => linked.has(String(item.variantId ?? ""))));
  if (!withEsim.length) return 0;
  const ids = { order: { $in: withEsim.map((order) => order._id) } };
  const queued = new Set(
    [...(await EsimFulfillment.distinct("order", ids)), ...(await EsimTopup.distinct("order", ids))].map(String),
  );
  let added = 0;
  for (const order of withEsim) {
    if (!queued.has(String(order._id))) added += (await enqueueOrderFulfillment(order._id)) + (await enqueueOrderTopups(order._id));
  }
  return added;
}

/** Orders with a failed eSIM or top-up nobody has refunded yet (a settlement that never ran). */
async function unrefundedOrders(): Promise<string[]> {
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
  const filter = { state: "failed" as const, refund: null, updatedAt: { $gte: since } };
  return [...new Set([...(await EsimFulfillment.distinct("order", filter)), ...(await EsimTopup.distinct("order", filter))].map(String))];
}

export async function runFulfilmentCron() {
  const swept = await sweepUnqueuedOrders();
  const result = await processFulfillmentJobs({ limit: 100, budgetMs: 35_000 });
  const topups = await processTopupJobs({ limit: 100, budgetMs: 15_000 });
  const deliveries: Record<string, string> = {};
  for (const orderId of new Set([...result.orders, ...topups.orders, ...(await unrefundedOrders())])) {
    deliveries[orderId] = await settleOrderDelivery(orderId);
  }
  return { swept, ...result, topups, deliveries };
}
