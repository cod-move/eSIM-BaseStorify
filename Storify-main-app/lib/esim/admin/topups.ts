import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimTopup } from "@/models/esim-topup.model";

/**
 * Admin → eSIM → Top-ups (TOP-06, the admin's side; ADM-08 for top-ups):
 * every top-up, filtered by status, shopper, supplier and date, with the
 * ones that need a person first — failed and not refunded, or still being
 * tried longer than they should.
 */

export type TopupView = "attention" | "failed" | "stuck" | "completed" | "all";

const STUCK_PENDING_MS = 30 * 60_000;
const OVERDUE_MS = 10 * 60_000;

function viewQuery(view: TopupView): Record<string, unknown> {
  const now = Date.now();
  const stuck = {
    state: { $in: ["queued", "processing"] },
    $or: [
      { pendingSince: { $lt: new Date(now - STUCK_PENDING_MS) } },
      { candidateAttempts: { $gte: 3 } },
      { nextAttemptAt: { $lt: new Date(now - OVERDUE_MS) } },
    ],
  };
  const failedOpen = { state: "failed", $or: [{ refund: null }, { "refund.state": { $in: ["pending", "manual"] } }] };
  switch (view) {
    case "failed":
      return { state: "failed" };
    case "stuck":
      return stuck;
    case "completed":
      return { state: "completed" };
    case "all":
      return {};
    default:
      return { $or: [failedOpen, stuck] };
  }
}

export interface TopupFilters {
  page?: number;
  pageSize?: number;
  /** Order number, ICCID, or the shopper's email. */
  search?: string;
  provider?: string;
  from?: string;
  to?: string;
}

export interface TopupRow {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string | null;
  esimId: string | null;
  iccid: string | null;
  name: string;
  providerCode: string;
  mode: string;
  priceMinor: number;
  cost: { currency: string; amountMinor: number };
  state: string;
  attempts: number;
  providerTopupId: string | null;
  lastError: { code: string; message: string; at: string } | null;
  refund: { state: string; amount: number; at: string; note: string | null } | null;
  createdAt: string;
  completedAt: string | null;
  history: Array<{ at: string; event: string; detail: string | null }>;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function day(value: string | undefined, end: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return end ? new Date(date.getTime() + 86_400_000) : date;
}

export async function listTopupsAdmin(view: TopupView, filters: TopupFilters = {}) {
  await connectDB();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));
  const match: Record<string, unknown> = { ...viewQuery(view) };
  const and: Record<string, unknown>[] = [];
  if (filters.provider) match.providerCode = filters.provider;
  const from = day(filters.from, false);
  const to = day(filters.to, true);
  if (from || to) match.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  const search = filters.search?.trim();
  if (search) {
    const pattern = new RegExp(escape(search), "i");
    const or: Record<string, unknown>[] = [{ orderNumber: pattern }, { iccid: pattern }];
    if (search.includes("@")) {
      const users = await User.find({ email: pattern }).select({ _id: 1 }).limit(50).lean();
      if (users.length) or.push({ customer: { $in: users.map((user) => user._id) } });
    }
    and.push({ $or: or });
  }
  if (and.length) match.$and = and;

  const [topups, total, counts, providers] = await Promise.all([
    EsimTopup.find(match).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    EsimTopup.countDocuments(match),
    Promise.all((["attention", "failed", "stuck"] as const).map((name) => EsimTopup.countDocuments(viewQuery(name)))),
    EsimTopup.distinct("providerCode") as Promise<string[]>,
  ]);
  const customerIds = topups.map((topup) => topup.customer).filter(Boolean) as mongoose.Types.ObjectId[];
  const users = await User.find({ _id: { $in: customerIds } })
    .select({ email: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; email: string }>>();
  const emailById = new Map(users.map((user) => [String(user._id), user.email]));
  const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);
  const rows = topups.map((topup): TopupRow => ({
    id: String(topup._id),
    orderId: String(topup.order),
    orderNumber: topup.orderNumber,
    customer: topup.customer ? emailById.get(String(topup.customer)) ?? null : null,
    esimId: topup.esim ? String(topup.esim) : null,
    iccid: topup.iccid,
    name: topup.name,
    providerCode: topup.providerCode,
    mode: topup.mode,
    priceMinor: topup.priceMinor,
    cost: { currency: topup.cost?.currency ?? "USD", amountMinor: topup.cost?.amountMinor ?? 0 },
    state: topup.state,
    attempts: topup.attempts,
    providerTopupId: topup.providerTopupId,
    lastError: topup.lastError ? { code: topup.lastError.code, message: topup.lastError.message, at: iso(topup.lastError.at)! } : null,
    refund: topup.refund ? { state: topup.refund.state, amount: topup.refund.amount, at: iso(topup.refund.at)!, note: topup.refund.note ?? null } : null,
    createdAt: iso(topup.createdAt)!,
    completedAt: iso(topup.completedAt),
    history: topup.history.slice(-12).map((entry) => ({ at: iso(entry.at)!, event: entry.event, detail: entry.detail ?? null })),
  }));
  return {
    rows,
    providers: providers.filter(Boolean).sort(),
    counts: { attention: counts[0], failed: counts[1], stuck: counts[2] },
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export type TopupList = Awaited<ReturnType<typeof listTopupsAdmin>>;
