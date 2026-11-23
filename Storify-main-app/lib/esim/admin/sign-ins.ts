import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { CustomerProfile, User } from "@/models";
import { EsimSignIn } from "@/models/esim-sign-in.model";

/**
 * Admin → eSIM → Sign-ins: every account's sign-ins in one list, newest first
 * (the log patch P61 writes; one account's own list is on its customer page).
 * Kept 180 days by the collection's TTL.
 */

export const SIGN_IN_METHODS = [
  "password",
  "social",
  "two-factor",
  "sign-up",
  "email-link",
  "impersonation",
  "renewed",
  "other",
] as const;
export const SIGN_IN_CLIENTS = ["web", "shop-app", "biz-app"] as const;

export interface SignInFilters {
  method?: string;
  client?: string;
  /** Part of an email or name, or the start of an IP address. */
  search?: string;
}

export interface AdminSignInRow {
  id: string;
  at: string;
  userId: string;
  email: string | null;
  name: string | null;
  /** The account's customer page, when it has one. */
  customerId: string | null;
  method: string;
  client: string | null;
  ip: string | null;
  userAgent: string | null;
  /** Email of the admin who signed in as this customer. */
  impersonatedBy: string | null;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** An IPv4 or IPv6 address, or the start of one. */
const IP_LIKE = /^(\d{1,3}\.){1,3}\d{0,3}$|^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){1,7}$/i;
const MATCHING_USERS = 500;

async function match(filters: SignInFilters): Promise<Record<string, unknown> | null> {
  const query: Record<string, unknown> = {};
  if (filters.method && (SIGN_IN_METHODS as readonly string[]).includes(filters.method)) query.method = filters.method;
  if (filters.client && (SIGN_IN_CLIENTS as readonly string[]).includes(filters.client)) query.client = filters.client;
  const search = filters.search?.trim();
  if (search) {
    if (IP_LIKE.test(search)) {
      query.ip = new RegExp(`^${escapeRegex(search)}`, "i");
    } else {
      const pattern = new RegExp(escapeRegex(search), "i");
      const users = await User.find({ $or: [{ email: pattern }, { name: pattern }] })
        .select({ _id: 1 })
        .limit(MATCHING_USERS)
        .lean<Array<{ _id: mongoose.Types.ObjectId }>>();
      if (users.length === 0) return null;
      query.user = { $in: users.map((user) => user._id) };
    }
  }
  return query;
}

export async function listAllSignIns(filters: SignInFilters, options: { page?: number; pageSize?: number } = {}) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 50));
  const query = await match(filters);
  if (!query) {
    return { rows: [] as AdminSignInRow[], pagination: { page: 1, pageSize, total: 0, totalPages: 1 } };
  }
  const [entries, total] = await Promise.all([
    EsimSignIn.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    EsimSignIn.countDocuments(query),
  ]);

  const userIds = [
    ...new Set(
      entries.flatMap((entry) => [String(entry.user), ...(entry.impersonatedBy ? [String(entry.impersonatedBy)] : [])]),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));
  const [users, profiles] = userIds.length
    ? await Promise.all([
        User.find({ _id: { $in: userIds } })
          .select({ email: 1, name: 1 })
          .lean<Array<{ _id: mongoose.Types.ObjectId; email?: string; name?: string }>>(),
        CustomerProfile.find({ userId: { $in: userIds } })
          .select({ _id: 1, userId: 1 })
          .lean<Array<{ _id: mongoose.Types.ObjectId; userId?: mongoose.Types.ObjectId | null }>>(),
      ])
    : [[], []];
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const profileByUser = new Map(profiles.map((profile) => [String(profile.userId), String(profile._id)]));

  return {
    rows: entries.map((entry): AdminSignInRow => {
      const user = userById.get(String(entry.user));
      return {
        id: String(entry._id),
        at: new Date(entry.createdAt).toISOString(),
        userId: String(entry.user),
        email: user?.email ?? null,
        name: user?.name?.trim() || null,
        customerId: profileByUser.get(String(entry.user)) ?? null,
        method: entry.method,
        client: entry.client,
        ip: entry.ip,
        userAgent: entry.userAgent,
        impersonatedBy: entry.impersonatedBy ? (userById.get(String(entry.impersonatedBy))?.email ?? String(entry.impersonatedBy)) : null,
      };
    }),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
