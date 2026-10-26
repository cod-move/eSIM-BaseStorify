import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { refreshEsimProfile } from "@/lib/esim/account/esims";
import { displayOf, planTitle } from "@/lib/esim/account/display";
import { resendEsimDelivery } from "@/lib/esim/fulfillment/delivery";

/**
 * Admin → eSIM → eSIMs (ADM-07): every issued eSIM, searchable by ICCID,
 * order number, email or customer; its detail with fulfilment history and
 * supplier calls; refresh usage, resend the delivery email, cancel it at the
 * supplier.
 */

export interface AdminEsimFilters {
  /** ICCID, order number or email. */
  search?: string;
  provider?: string;
  /** The shopper-facing status (lib/esim/account/display.ts). */
  lifecycle?: string;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function query(filters: AdminEsimFilters) {
  const match: Record<string, unknown> = {};
  if (filters.provider) match.providerCode = filters.provider;
  if (filters.lifecycle) match["lifecycle.status"] = filters.lifecycle;
  const search = filters.search?.trim();
  if (search) {
    const digits = search.replace(/\s+/g, "");
    if (/^\d{10,22}F?$/i.test(digits)) {
      match.iccid = new RegExp(`^${escapeRegex(digits)}`, "i");
    } else if (search.includes("@")) {
      const users = await User.find({ email: search.toLowerCase() }).select({ _id: 1 }).lean();
      match.$or = [{ email: search.toLowerCase() }, { customer: { $in: users.map((user) => user._id) } }];
    } else {
      match.orderNumber = new RegExp(escapeRegex(search), "i");
    }
  }
  return match;
}

export interface AdminEsimRow {
  id: string;
  iccid: string | null;
  orderNumber: string;
  orderId: string;
  customer: string | null;
  plan: string;
  providerCode: string;
  status: string;
  statusLabel: string;
  tone: string;
  remainingBytes: number | null;
  totalBytes: number | null;
  fulfilledAt: string | null;
  expiresAt: string | null;
}

export async function listAdminEsims(filters: AdminEsimFilters, options: { page?: number; pageSize?: number } = {}) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 25));
  const match = await query(filters);
  const [profiles, total] = await Promise.all([
    EsimProfile.find(match).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).select({ raw: 0 }).lean<IEsimProfile[]>(),
    EsimProfile.countDocuments(match),
  ]);
  const [plans, users] = await Promise.all([
    EsimPlan.find({ _id: { $in: profiles.map((profile) => profile.plan) } }).select({ name: 1, topup: 1 }).lean(),
    User.find({ _id: { $in: profiles.map((profile) => profile.customer).filter(Boolean) } }).select({ email: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; email: string }>>(),
  ]);
  const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
  const emailById = new Map(users.map((user) => [String(user._id), user.email]));
  const rows = profiles.map((profile): AdminEsimRow => {
    const plan = planById.get(String(profile.plan));
    const display = displayOf({
      status: profile.status,
      lifecycle: profile.lifecycle?.status ?? null,
      topupSupported: plan?.topup.supported ?? false,
      topupWindow: plan?.topup.window ?? null,
    });
    return {
      id: String(profile._id),
      iccid: profile.iccid,
      orderNumber: profile.orderNumber,
      orderId: String(profile.order),
      customer: (profile.customer && emailById.get(String(profile.customer))) || profile.email,
      plan: planTitle(plan?.name ?? "eSIM", profile.durationDays),
      providerCode: profile.providerCode,
      status: display.status,
      statusLabel: display.label,
      tone: display.tone,
      remainingBytes: profile.usage?.remainingBytes ?? null,
      totalBytes: profile.usage?.totalBytes ?? null,
      fulfilledAt: profile.fulfilledAt ? new Date(profile.fulfilledAt).toISOString() : null,
      expiresAt: profile.expiresAt ? new Date(profile.expiresAt).toISOString() : null,
    };
  });
  return { rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

/** One eSIM with everything an admin needs to answer a shopper about it. */
export async function getAdminEsim(id: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) return null;
  const profile = await EsimProfile.findById(id).select({ raw: 0 }).lean<IEsimProfile | null>();
  if (!profile) return null;
  const [plan, packages, job, logs, user] = await Promise.all([
    EsimPlan.findById(profile.plan).select({ name: 1, providerPlanId: 1, destination: 1, data: 1, validityDays: 1, topup: 1 }).lean(),
    EsimPackage.find({ esim: profile._id }).sort({ createdAt: 1 }).lean(),
    EsimFulfillment.findOne({ order: profile.order, lineIndex: profile.lineIndex, unit: profile.unit }).lean(),
    EsimProviderLog.find({ $or: [{ "refs.esimId": String(profile._id) }, { "refs.orderId": String(profile.order) }] })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    profile.customer ? User.findById(profile.customer).select({ email: 1, name: 1 }).lean<{ email: string; name?: string } | null>() : null,
  ]);
  const display = displayOf({
    status: profile.status,
    lifecycle: profile.lifecycle?.status ?? null,
    topupSupported: plan?.topup.supported ?? false,
    topupWindow: plan?.topup.window ?? null,
  });
  return JSON.parse(
    JSON.stringify({
      profile: { ...profile, installation: { ...profile.installation, activationCode: profile.installation.activationCode ? "(hidden)" : null } },
      customer: user ? { email: user.email, name: user.name ?? null } : profile.email ? { email: profile.email, name: null } : null,
      plan: plan ? { ...plan, title: planTitle(plan.name, profile.durationDays) } : null,
      display,
      packages,
      job,
      logs: logs.map((log) => ({
        id: String(log._id),
        operation: log.operation,
        ok: log.ok,
        durationMs: log.durationMs,
        errorCode: log.errorCode ?? null,
        errorMessage: log.errorMessage ?? null,
        createdAt: log.createdAt,
      })),
    }),
  );
}

export async function adminRefreshEsim(id: string) {
  await connectDB();
  const profile = mongoose.isValidObjectId(id) ? await EsimProfile.findById(id) : null;
  if (!profile) throw new Error("Unknown eSIM");
  return refreshEsimProfile(profile);
}

export async function adminResendEsim(id: string) {
  await connectDB();
  return resendEsimDelivery(id);
}

/**
 * Cancels the eSIM at the supplier where it can still be cancelled (usually
 * only before installation). The eSIM is marked cancelled either way the
 * supplier agrees; a refund stays a separate, deliberate step.
 */
export async function adminCancelEsim(id: string) {
  await connectDB();
  const profile = mongoose.isValidObjectId(id) ? await EsimProfile.findById(id) : null;
  if (!profile) throw new Error("Unknown eSIM");
  if (profile.lifecycle?.status === "cancelled") return { cancelled: true, message: "Already cancelled" };
  const provider = await EsimProvider.findOne({ code: profile.providerCode }).select("+secretCredentials");
  if (!provider) throw new Error("Supplier is not set up");
  const adapter = adapterFor(provider);
  if (!adapter.capabilities.cancel) return { cancelled: false, message: `${provider.name} does not support cancelling an eSIM through its API` };
  const result = await withProviderLog(
    { provider: provider._id as mongoose.Types.ObjectId, providerCode: provider.code, operation: "cancel", refs: { esimId: String(profile._id), orderId: String(profile.order) } },
    () => adapter.cancel({ providerEsimId: profile.providerEsimId, simId: profile.simId, iccid: profile.iccid }),
    (value) => ({ status: value.status }),
  );
  if (result.status === "cancelled") {
    profile.set("lifecycle.status", "cancelled");
    profile.set("lifecycle.lastStatusUpdateAt", new Date());
    await profile.save();
    await EsimPackage.updateMany({ esim: profile._id }, { $set: { status: "cancelled" } });
    return { cancelled: true, message: "Cancelled at the supplier" };
  }
  return { cancelled: false, message: `The supplier answered: ${result.status}` };
}
