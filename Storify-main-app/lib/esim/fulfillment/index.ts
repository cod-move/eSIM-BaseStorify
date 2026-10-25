import "server-only";

import type { Types } from "mongoose";
import { PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { enqueueOrderFulfillment, processFulfillmentJobs } from "@/lib/esim/fulfillment/service";
import { settleOrderDelivery } from "@/lib/esim/fulfillment/delivery";

/**
 * The two ways eSIM fulfilment is driven. Payment settlement calls the first
 * (patch point P3); the `esim-fulfillment` cron calls the second every minute.
 */

/** Queue the paid order's eSIMs. Cheap and durable: only writes jobs. */
export async function esimQueueOrder(orderId: string): Promise<number> {
  return enqueueOrderFulfillment(orderId);
}

/** Buy the order's queued eSIMs now, then deliver if they all settled. */
export async function esimFulfilOrder(orderId: string) {
  const result = await processFulfillmentJobs({ orderId, budgetMs: 25_000 });
  if (result.processed) await settleOrderDelivery(orderId);
  return result;
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
  if (!linked.size) return 0;
  const orders = await Order.find({ paymentStatus: PAYMENT_STATUS.PAID, updatedAt: { $gte: since } })
    .select({ "items.variantId": 1 })
    .lean<Array<{ _id: Types.ObjectId; items: Array<{ variantId?: unknown }> }>>();
  const withEsim = orders.filter((order) => order.items.some((item) => linked.has(String(item.variantId ?? ""))));
  if (!withEsim.length) return 0;
  const queued = new Set(
    (await EsimFulfillment.distinct("order", { order: { $in: withEsim.map((order) => order._id) } })).map(String),
  );
  let added = 0;
  for (const order of withEsim) {
    if (!queued.has(String(order._id))) added += await enqueueOrderFulfillment(order._id);
  }
  return added;
}

export async function runFulfilmentCron() {
  const swept = await sweepUnqueuedOrders();
  const result = await processFulfillmentJobs({ limit: 100, budgetMs: 50_000 });
  const deliveries: Record<string, string> = {};
  for (const orderId of result.orders) deliveries[orderId] = await settleOrderDelivery(orderId);
  return { swept, ...result, deliveries };
}
