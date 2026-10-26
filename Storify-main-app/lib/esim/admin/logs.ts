import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { Order } from "@/models";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";

/**
 * Admin → eSIM → Supplier calls (ADM-09): every call to a supplier with its
 * redacted request and response (lib/esim/redact.ts runs before anything is
 * stored), findable by order number or ICCID.
 */

export interface LogFilters {
  provider?: string;
  operation?: string;
  outcome?: "ok" | "error";
  /** An order number or an ICCID. */
  search?: string;
}

async function query(filters: LogFilters) {
  const match: Record<string, unknown> = {};
  if (filters.provider) match.providerCode = filters.provider;
  if (filters.operation) match.operation = filters.operation;
  if (filters.outcome) match.ok = filters.outcome === "ok";
  const search = filters.search?.trim();
  if (search) {
    const digits = search.replace(/\s+/g, "");
    if (/^\d{10,22}F?$/i.test(digits)) {
      const profiles = await EsimProfile.find({ iccid: new RegExp(`^${digits}`, "i") }).select({ _id: 1, order: 1 }).limit(20).lean();
      match.$or = [
        { "refs.esimId": { $in: profiles.map((profile) => String(profile._id)) } },
        { "refs.orderId": { $in: profiles.map((profile) => String(profile.order)) } },
        { "request.iccid": digits },
      ];
    } else {
      const orders = await Order.find({ orderNumber: search }).select({ _id: 1 }).limit(5).lean();
      match["refs.orderId"] = { $in: orders.map((order) => String(order._id)) };
    }
  }
  return match;
}

export async function listLogs(filters: LogFilters, options: { page?: number; pageSize?: number } = {}) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 50));
  const match = await query(filters);
  const [logs, total, operations] = await Promise.all([
    EsimProviderLog.find(match).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).select({ request: 0, response: 0 }).lean(),
    EsimProviderLog.countDocuments(match),
    EsimProviderLog.distinct("operation"),
  ]);
  return {
    rows: logs.map((log) => ({
      id: String(log._id),
      providerCode: log.providerCode,
      operation: log.operation,
      ok: log.ok,
      durationMs: log.durationMs,
      errorCode: log.errorCode ?? null,
      errorMessage: log.errorMessage ?? null,
      orderId: log.refs?.orderId ?? null,
      esimId: log.refs?.esimId ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    operations: (operations as string[]).sort(),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/** One call with its (already redacted) request and response. */
export async function getLog(id: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) return null;
  const log = await EsimProviderLog.findById(id).lean();
  return log ? JSON.parse(JSON.stringify(log)) : null;
}
