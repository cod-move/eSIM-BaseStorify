import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { EsimSignIn } from "@/models/esim-sign-in.model";
import { signInMethod } from "./sign-in-method";

/**
 * The sign-in log (patch P61): every session Better Auth mints for an
 * account, from `databaseHooks.session.create.after` in lib/auth/auth.ts.
 * Re-mints (a password change, two-factor switched on) are kept too, marked
 * "renewed", so the list is every session the account had. Never blocks a
 * sign-in: a failed write is only logged.
 */
export async function recordSignIn(
  session: {
    id?: unknown;
    userId?: unknown;
    ipAddress?: unknown;
    userAgent?: unknown;
    client?: unknown;
    impersonatedBy?: unknown;
  },
  path: string | null | undefined,
): Promise<void> {
  try {
    const userId = typeof session.userId === "string" ? session.userId : null;
    if (!userId || !mongoose.isValidObjectId(userId)) return;
    const by =
      typeof session.impersonatedBy === "string" &&
      mongoose.isValidObjectId(session.impersonatedBy)
        ? session.impersonatedBy
        : null;
    const text = (value: unknown, max: number) =>
      typeof value === "string" && value.trim()
        ? value.trim().slice(0, max)
        : null;
    await connectDB();
    await EsimSignIn.create({
      user: new mongoose.Types.ObjectId(userId),
      sessionId: text(session.id, 100),
      method: by ? "impersonation" : signInMethod(path),
      path: text(path, 120),
      client: text(session.client, 20),
      ip: text(session.ipAddress, 64),
      userAgent: text(session.userAgent, 400),
      impersonatedBy: by ? new mongoose.Types.ObjectId(by) : null,
    });
  } catch (error) {
    console.error("[esim] sign-in log write failed:", error);
  }
}

export interface SignInRow {
  id: string;
  at: string;
  method: string;
  client: string | null;
  ip: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
}

/** One account's sign-ins, newest first. */
export async function listSignIns(
  userId: string,
  options: { page?: number; pageSize?: number } = {},
) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 20));
  const filter = { user: new mongoose.Types.ObjectId(userId) };
  const [rows, total] = await Promise.all([
    EsimSignIn.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    EsimSignIn.countDocuments(filter),
  ]);
  return {
    rows: rows.map((row): SignInRow => ({
      id: String(row._id),
      at: new Date(row.createdAt).toISOString(),
      method: row.method,
      client: row.client,
      ip: row.ip,
      userAgent: row.userAgent,
      impersonatedBy: row.impersonatedBy ? String(row.impersonatedBy) : null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
