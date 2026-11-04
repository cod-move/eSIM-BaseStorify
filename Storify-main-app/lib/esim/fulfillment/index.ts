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
import { findWalletProduct } from "@/lib/esim/wallet/product";
import { creditWalletTopups, walletTopupsDue } from "@/lib/esim/wallet/credit";
import { EsimNumberOrder } from "@/models/esim-number-order.model";
import { enqueueOrderNumbers, processNumberJobs } from "@/lib/esim/numbers/fulfil";
import { findNumberProduct } from "@/lib/esim/numbers/product";
import { releaseExpiredReservations } from "@/lib/esim/numbers/cart-line";
import { EsimNumberOp } from "@/models/esim-number-op.model";
import { processNumberOps } from "@/lib/esim/numbers/ops";
import { enqueueOrderNumberTopups } from "@/lib/esim/numbers/topup";
import { findNumberTopupProduct } from "@/lib/esim/numbers/product";

/**
 * The two ways eSIM fulfilment is driven. Payment settlement calls the first
 * (patch point P3); the `esim-fulfillment` cron calls the second every minute.
 * Both carry an order's top-ups (lib/esim/topup), wallet top-ups
 * (lib/esim/wallet) and number cards (lib/esim/numbers) along with its eSIMs.
 */

/**
 * Queue the paid order's eSIMs and top-ups. Cheap and durable: only writes
 * jobs. A wallet top-up waiting to be credited counts too, so the caller runs
 * `esimFulfilOrder`, which credits it after the response.
 */
export async function esimQueueOrder(orderId: string): Promise<number> {
  return (await enqueueOrderFulfillment(orderId)) + (await enqueueOrderTopups(orderId)) + (await enqueueOrderNumbers(orderId)) + (await enqueueOrderNumberTopups(orderId)) + (await walletTopupsDue(orderId));
}

/** Buy the order's queued eSIMs and make its top-ups now, then deliver if they all settled. */
export async function esimFulfilOrder(orderId: string) {
  const wallet = await creditWalletTopups(orderId);
  const numbers = await processNumberJobs({ orderId });
  const numberOps = await processNumberOps({ orderId, budgetMs: 10_000 });
  const result = await processFulfillmentJobs({ orderId, budgetMs: 20_000 });
  const topups = await processTopupJobs({ orderId, budgetMs: 10_000 });
  // Always: a top-up can fail as it is queued (its quote gone) and still needs its refund.
  await settleOrderDelivery(orderId);
  return { ...result, topups, wallet, numbers, numberOps };
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
  const numberProduct = await findNumberProduct();
  if (numberProduct) linked.add(numberProduct.variantId);
  const numberTopupProduct = await findNumberTopupProduct();
  if (numberTopupProduct) linked.add(numberTopupProduct.variantId);
  const walletProduct = await findWalletProduct();
  if (!linked.size && !walletProduct) return 0;
  const orders = await Order.find({ paymentStatus: PAYMENT_STATUS.PAID, updatedAt: { $gte: since } })
    .select({ "items.variantId": 1 })
    .lean<Array<{ _id: Types.ObjectId; items: Array<{ variantId?: unknown }> }>>();
  let added = 0;
  // A wallet top-up never credited (settlement's after-response work lost): credit it now. Idempotent.
  if (walletProduct) {
    for (const order of orders.filter((entry) => entry.items.some((item) => String(item.variantId ?? "") === walletProduct.variantId))) {
      added += (await creditWalletTopups(order._id)).credited;
    }
  }
  const withEsim = orders.filter((order) => order.items.some((item) => linked.has(String(item.variantId ?? ""))));
  if (!withEsim.length) return added;
  const ids = { order: { $in: withEsim.map((order) => order._id) } };
  const queued = new Set(
    [...(await EsimFulfillment.distinct("order", ids)), ...(await EsimTopup.distinct("order", ids)), ...(await EsimNumberOrder.distinct("order", ids)), ...(await EsimNumberOp.distinct("order", ids))].map(String),
  );
  for (const order of withEsim) {
    if (!queued.has(String(order._id))) {
      added += (await enqueueOrderFulfillment(order._id)) + (await enqueueOrderTopups(order._id)) + (await enqueueOrderNumbers(order._id)) + (await enqueueOrderNumberTopups(order._id));
    }
  }
  return added;
}

/** Orders with a failed eSIM or top-up nobody has refunded yet (a settlement that never ran). */
async function unrefundedOrders(): Promise<string[]> {
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
  const filter = { state: "failed" as const, refund: null, updatedAt: { $gte: since } };
  return [
    ...new Set(
      [...(await EsimFulfillment.distinct("order", filter)), ...(await EsimTopup.distinct("order", filter)), ...(await EsimNumberOrder.distinct("order", filter)), ...(await EsimNumberOp.distinct("order", filter))].map(String),
    ),
  ];
}

export async function runFulfilmentCron() {
  const swept = await sweepUnqueuedOrders();
  const result = await processFulfillmentJobs({ limit: 100, budgetMs: 35_000 });
  const topups = await processTopupJobs({ limit: 100, budgetMs: 15_000 });
  const numbers = await processNumberJobs({ limit: 100 });
  const numberOps = await processNumberOps({ limit: 100, budgetMs: 15_000 });
  // NUM-04: holds nobody paid for go back on sale.
  const released = await releaseExpiredReservations();
  const deliveries: Record<string, string> = {};
  for (const orderId of new Set([...result.orders, ...topups.orders, ...numbers.orders, ...numberOps.orders, ...(await unrefundedOrders())])) {
    deliveries[orderId] = await settleOrderDelivery(orderId);
  }
  return { swept, ...result, topups, numbers: { ...numbers, released, ops: numberOps }, deliveries };
}
