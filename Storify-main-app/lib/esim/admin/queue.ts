import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { Order, User } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPlan } from "@/models/esim-plan.model";

/**
 * Admin → eSIM → Problems (ADM-08): the fulfilment jobs that need a person.
 *
 * - failed: every supplier refused, or an admin stopped it; shows whether
 *   the shopper was refunded (store credit) or still waits for a refund by
 *   hand (a guest order).
 * - stuck: still being tried longer than it should — waiting on a supplier
 *   for over 30 minutes, retried three times or more, or overdue by over 10
 *   minutes (the cron is not running).
 */

export type QueueView = "attention" | "failed" | "stuck" | "all";

const STUCK_PENDING_MS = 30 * 60_000;
const OVERDUE_MS = 10 * 60_000;

function viewQuery(view: QueueView): Record<string, unknown> {
  const now = Date.now();
  const stuck = {
    state: { $in: ["queued", "purchasing", "provider_pending"] },
    $or: [
      { pendingSince: { $lt: new Date(now - STUCK_PENDING_MS) } },
      { candidateAttempts: { $gte: 3 } },
      { nextAttemptAt: { $lt: new Date(now - OVERDUE_MS) } },
    ],
  };
  // A failed job still needs a person while its refund is missing or waits for one.
  const failed = { state: "failed" };
  const failedOpen = { state: "failed", $or: [{ refund: null }, { "refund.state": { $in: ["pending", "manual"] } }] };
  if (view === "failed") return failed;
  if (view === "stuck") return stuck;
  if (view === "all") return {};
  return { $or: [failedOpen, stuck] };
}

export interface QueueRow {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string | null;
  unit: string;
  state: string;
  candidates: Array<{ index: number; planId: string; name: string; providerCode: string }>;
  candidateIndex: number;
  attempts: number;
  providerOrderId: string | null;
  lastError: { code: string; message: string; at: string } | null;
  refund: { state: string; amount: number; at: string; note: string | null } | null;
  nextAttemptAt: string | null;
  pendingSince: string | null;
  createdAt: string;
  history: Array<{ at: string; event: string; detail: string | null }>;
}

export async function listQueue(view: QueueView, options: { page?: number; pageSize?: number; search?: string } = {}) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 25));
  const match: Record<string, unknown> = { ...viewQuery(view) };
  if (options.search?.trim()) match.orderNumber = new RegExp(options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [jobs, total, counts] = await Promise.all([
    EsimFulfillment.find(match).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    EsimFulfillment.countDocuments(match),
    Promise.all((["attention", "failed", "stuck"] as const).map((name) => EsimFulfillment.countDocuments(viewQuery(name)))),
  ]);
  const plans = await EsimPlan.find({ _id: { $in: jobs.flatMap((job) => job.candidates) } }).select({ name: 1, providerCode: 1 }).lean();
  const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
  const orders = await Order.find({ _id: { $in: jobs.map((job) => job.order) } })
    .select({ customerId: 1, guestEmail: 1, items: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; customerId?: unknown; guestEmail?: string; items: Array<{ name?: string; quantity?: number }> }>>();
  const orderById = new Map(orders.map((order) => [String(order._id), order]));
  const customerIds = orders.map((order) => String(order.customerId ?? "")).filter((id) => mongoose.isValidObjectId(id));
  const users = await User.find({ _id: { $in: customerIds } })
    .select({ email: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; email: string }>>();
  const emailById = new Map(users.map((user) => [String(user._id), user.email]));
  const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);
  const rows = jobs.map((job): QueueRow => {
    const order = orderById.get(String(job.order));
    const line = order?.items[job.lineIndex];
    return {
      id: String(job._id),
      orderId: String(job.order),
      orderNumber: job.orderNumber,
      customer: order?.guestEmail ?? (order?.customerId ? emailById.get(String(order.customerId)) ?? null : null),
      unit: `${line?.name ?? "eSIM"}${(line?.quantity ?? 1) > 1 ? ` (${job.unit}/${line?.quantity})` : ""}`,
      state: job.state,
      candidates: job.candidates.map((planId, index) => {
        const plan = planById.get(String(planId));
        return { index, planId: String(planId), name: plan?.name ?? "(plan removed)", providerCode: plan?.providerCode ?? "?" };
      }),
      candidateIndex: job.candidateIndex,
      attempts: job.attempts,
      providerOrderId: job.providerOrderId,
      lastError: job.lastError ? { code: job.lastError.code, message: job.lastError.message, at: iso(job.lastError.at)! } : null,
      refund: job.refund ? { state: job.refund.state, amount: job.refund.amount, at: iso(job.refund.at)!, note: job.refund.note ?? null } : null,
      nextAttemptAt: iso(job.nextAttemptAt),
      pendingSince: iso(job.pendingSince),
      createdAt: iso(job.createdAt)!,
      history: job.history.slice(-12).map((entry) => ({ at: iso(entry.at)!, event: entry.event, detail: entry.detail ?? null })),
    };
  });
  return {
    rows,
    counts: { attention: counts[0], failed: counts[1], stuck: counts[2] },
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
