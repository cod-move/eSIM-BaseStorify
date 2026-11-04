import "server-only";

import { mongoose } from "@/lib/db";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberOrder, type IEsimNumberOrder } from "@/models/esim-number-order.model";
import { findNumberProduct } from "@/lib/esim/numbers/product";
import type { EsimLineAttributes } from "@/lib/esim/cart/line-attributes";
import type { NumberLineSnapshot } from "@/lib/esim/numbers/line";
import { enqueueFirstOps } from "@/lib/esim/numbers/ops";

/**
 * A paid number card becomes its buyer's (NUM-05). Payment settlement queues
 * one job per number line (`enqueueOrderNumbers`, with the order's eSIMs);
 * `processNumberJobs` hands the number over in one atomic write — free, held
 * by the buyer, or held by someone whose hold ran out — so it can never go to
 * two orders. A number taken meanwhile fails the job, and the order's
 * settlement refunds it like a failed eSIM.
 *
 * The first recharge and data package are marked `pending` on the job and
 * queued as operations from the line's snapshot (lib/esim/numbers/ops.ts).
 */

type Line = { variantId?: unknown; price?: number; quantity?: number; lineAttributes?: unknown };

const snapshotOf = (attributes: EsimLineAttributes): NumberLineSnapshot | null => {
  const number = attributes.number as Partial<NumberLineSnapshot> | undefined;
  return number && typeof number.msisdn === "string" && typeof number.numberMinor === "number" ? (number as NumberLineSnapshot) : null;
};

/** One job per number line of a paid order. Idempotent through the unique (order, line) index. */
export async function enqueueOrderNumbers(orderId: unknown): Promise<number> {
  const product = await findNumberProduct();
  if (!product) return 0;
  const order = await Order.findById(orderId)
    .select({ orderNumber: 1, paymentStatus: 1, status: 1, items: 1, customerId: 1, guestEmail: 1 })
    .lean<{
      _id: mongoose.Types.ObjectId;
      orderNumber: string;
      paymentStatus: string;
      status: string;
      items: Line[];
      customerId?: unknown;
      guestEmail?: string | null;
    } | null>();
  if (!order || order.paymentStatus !== PAYMENT_STATUS.PAID || order.status === ORDER_STATUS.CANCELLED) return 0;
  const lines = order.items
    .map((item, lineIndex) => ({ item, lineIndex }))
    .filter(({ item }) => String(item.variantId ?? "") === product.variantId);
  if (!lines.length) return 0;

  const now = new Date();
  const customer = !order.guestEmail && mongoose.isValidObjectId(order.customerId) ? String(order.customerId) : null;
  let added = 0;
  for (const { item, lineIndex } of lines) {
    const attributes = (item.lineAttributes && typeof item.lineAttributes === "object" ? item.lineAttributes : {}) as EsimLineAttributes;
    const line = snapshotOf(attributes);
    const priceMinor = Math.round(Number(item.price || 0) * 100);
    const problem = !line || !mongoose.isValidObjectId(line.id)
      ? "The order line names no number"
      : !customer
        ? "A number needs an account; the order has none"
        : !(priceMinor > 0)
          ? "The line was not charged"
          : null;
    const fields = {
      order: order._id,
      orderNumber: order.orderNumber,
      lineIndex,
      customer: customer ? new mongoose.Types.ObjectId(customer) : null,
      number: line && mongoose.isValidObjectId(line.id) ? new mongoose.Types.ObjectId(line.id) : null,
      msisdn: line?.msisdn ?? "",
      priceMinor,
      line,
      ...(problem
        ? {
            state: "failed" as const,
            lastError: { code: "invalid", message: problem, at: now },
            history: [{ at: now, event: "failed", detail: problem }],
            ...(priceMinor > 0 ? {} : { refund: { state: "done" as const, amount: 0, at: now, note: "not charged" } }),
          }
        : { state: "queued" as const, history: [{ at: now, event: "queued" }] }),
    };
    const result = await EsimNumberOrder.updateOne({ order: order._id, lineIndex }, { $setOnInsert: fields }, { upsert: true });
    added += result.upsertedCount;
  }
  return added;
}

/** Gives the job's number to its buyer; true when it is theirs (now or from an earlier run). */
async function handOver(job: IEsimNumberOrder, now: Date): Promise<boolean> {
  if (!job.number || !job.customer) return false;
  const mine = await EsimNumber.exists({ _id: job.number, customer: job.customer, order: job.order });
  if (mine) return true;
  const taken = await EsimNumber.findOneAndUpdate(
    {
      _id: job.number,
      customer: null,
      $or: [
        { status: "available" },
        { status: "reserved", "reservation.customer": job.customer },
        { status: "reserved", "reservation.until": { $lt: now } },
      ],
    },
    { $set: { status: "sold", customer: job.customer, order: job.order, soldAt: now, reservation: null } },
    { returnDocument: "after" },
  ).lean();
  return Boolean(taken);
}

async function processOne(job: IEsimNumberOrder): Promise<IEsimNumberOrder["state"]> {
  const now = new Date();
  if (await handOver(job, now)) {
    const line = job.line;
    await EsimNumberOrder.updateOne(
      { _id: job._id, state: "queued" },
      {
        $set: {
          state: "fulfilled",
          fulfilledAt: now,
          lastError: null,
          recharge: line?.recharge ? "pending" : "none",
          packet: line?.packet ? "pending" : "none",
        },
        $push: { history: { at: now, event: "fulfilled", detail: `+${job.msisdn} is the buyer's` } },
      },
    );
    await enqueueFirstOps(job);
    return "fulfilled";
  }
  const message = "The number was taken by another order before this one was paid";
  await EsimNumberOrder.updateOne(
    { _id: job._id, state: "queued" },
    {
      $set: { state: "failed", lastError: { code: "taken", message, at: now } },
      $push: { history: { at: now, event: "failed", detail: message } },
    },
  );
  return "failed";
}

/** Carries out queued number jobs, for one order (settlement) or any (the cron). */
export async function processNumberJobs(options: { orderId?: string; limit?: number } = {}) {
  const filter: Record<string, unknown> = { state: "queued" };
  if (options.orderId) filter.order = new mongoose.Types.ObjectId(options.orderId);
  const jobs = await EsimNumberOrder.find(filter).sort({ createdAt: 1 }).limit(options.limit ?? 50);
  const result = { fulfilled: 0, failed: 0, orders: new Set<string>() };
  for (const job of jobs) {
    const state = await processOne(job);
    if (state === "fulfilled") result.fulfilled += 1;
    else result.failed += 1;
    result.orders.add(String(job.order));
  }
  return { fulfilled: result.fulfilled, failed: result.failed, orders: [...result.orders] };
}
