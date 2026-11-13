import "server-only";

import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { displayOf, planTitle, type Display } from "@/lib/esim/account/display";
import { ProviderError, type ProviderEsim, type ProviderUsage } from "@/lib/esim/providers/types";
import { shownBundles } from "@/lib/esim/providers/registry";
import { fillMissingIccid } from "@/lib/esim/account/iccid-backfill";

/**
 * A shopper's own eSIMs (USR-01..06): listing, one eSIM, refreshing its usage
 * and status from the supplier, and its remark.
 *
 * Ownership: the account the order was placed with, or — for an order placed
 * as a guest — the same email address once the account has verified it.
 * Anything else answers "not found", never "forbidden".
 */

const REFRESH_EVERY_MS = 60_000;

export interface EsimView {
  id: string;
  orderNumber: string;
  planName: string;
  destination: string;
  emoji: string | null;
  dataLabel: string;
  dataType: string;
  validityDays: number;
  providerCode: string;
  iccid: string | null;
  display: Display;
  remark: string | null;
  usage: IEsimProfile["usage"];
  lastUsageUpdateAt: Date | null;
  fulfilledAt: Date | null;
  expiresAt: Date | null;
  activationDeadline: Date | null;
  topupDeadline: Date | null;
  installation: IEsimProfile["installation"];
  customerLink: string | null;
  bundles: IEsimProfile["bundles"];
}

async function ownerFilter(userId: string) {
  const user = await User.findById(userId).select({ email: 1, emailVerified: 1 }).lean<{
    email?: string;
    emailVerified?: boolean;
  } | null>();
  const owners: Record<string, unknown>[] = [{ customer: new mongoose.Types.ObjectId(userId) }];
  if (user?.email && user.emailVerified) owners.push({ customer: null, email: user.email.toLowerCase() });
  return { $or: owners };
}

function view(profile: IEsimProfile, plan: IEsimPlan | undefined): EsimView {
  return {
    id: String(profile._id),
    orderNumber: profile.orderNumber,
    // A migrated eSIM whose plan is not here shows the old plan it carries.
    planName: planTitle(plan?.name ?? profile.legacyPlan?.name ?? "eSIM", profile.durationDays),
    destination: plan?.destination ?? "",
    emoji: plan?.emoji ?? null,
    dataLabel: plan?.data.label ?? profile.legacyPlan?.label ?? "",
    dataType: plan?.data.type ?? profile.legacyPlan?.dataType ?? "total",
    validityDays: profile.durationDays ?? plan?.validityDays ?? profile.legacyPlan?.validityDays ?? 0,
    providerCode: profile.providerCode,
    iccid: profile.iccid,
    display: displayOf({
      status: profile.status,
      lifecycle: profile.lifecycle?.status ?? null,
      topupSupported: plan?.topup.supported ?? false,
      topupWindow: plan?.topup.window ?? null,
    }),
    remark: profile.remark,
    usage: profile.usage,
    lastUsageUpdateAt: profile.lifecycle?.lastUsageUpdateAt ?? null,
    fulfilledAt: profile.fulfilledAt,
    expiresAt: profile.expiresAt,
    activationDeadline: profile.activationDeadline,
    topupDeadline: profile.topupDeadline,
    installation: profile.installation,
    customerLink: profile.customerLink,
    bundles: shownBundles(profile.providerCode, profile.bundles),
  };
}

async function plansFor(profiles: IEsimProfile[]) {
  const plans = await EsimPlan.find({ _id: { $in: profiles.map((profile) => profile.plan) } })
    .select({ name: 1, destination: 1, emoji: 1, data: 1, validityDays: 1, topup: 1 })
    .lean<IEsimPlan[]>();
  return new Map(plans.map((plan) => [String(plan._id), plan]));
}

export async function listCustomerEsims(userId: string): Promise<EsimView[]> {
  const profiles = await EsimProfile.find(await ownerFilter(userId)).sort({ createdAt: -1 }).limit(200).lean<IEsimProfile[]>();
  const plans = await plansFor(profiles);
  return profiles.map((profile) => view(profile, plans.get(String(profile.plan))));
}

export const ESIMS_PER_PAGE = 10;

/** One page of the account's eSIMs, newest first, for the "My eSIMs" page. */
export async function pageCustomerEsims(
  userId: string,
  page: number,
  pageSize = ESIMS_PER_PAGE,
): Promise<{ items: EsimView[]; page: number; totalPages: number; total: number }> {
  const filter = await ownerFilter(userId);
  const total = await EsimProfile.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // A page past the end (the list shrank, or a typed address) shows the last one.
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const profiles = await EsimProfile.find(filter)
    .sort({ createdAt: -1 })
    .skip((current - 1) * pageSize)
    .limit(pageSize)
    .lean<IEsimProfile[]>();
  const plans = await plansFor(profiles);
  return { items: profiles.map((profile) => view(profile, plans.get(String(profile.plan)))), page: current, totalPages, total };
}

/** The eSIM if this account owns it (see the ownership rule above), else null. */
export async function findOwnedEsim(userId: string, esimId: string) {
  if (!mongoose.isValidObjectId(esimId)) return null;
  return EsimProfile.findOne({ _id: esimId, ...(await ownerFilter(userId)) });
}

export async function getCustomerEsim(userId: string, esimId: string): Promise<EsimView | null> {
  const profile = await findOwnedEsim(userId, esimId);
  if (!profile) return null;
  const plans = await plansFor([profile]);
  return view(profile, plans.get(String(profile.plan)));
}

export async function updateRemark(userId: string, esimId: string, remark: string): Promise<boolean> {
  const profile = await findOwnedEsim(userId, esimId);
  if (!profile) return false;
  profile.remark = remark.trim().slice(0, 100) || null;
  await profile.save();
  return true;
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Asks the supplier for the eSIM's usage and lifecycle. At most once a minute
 * per eSIM; a failed call keeps the stored snapshot and says why.
 */
export async function refreshCustomerEsim(
  userId: string,
  esimId: string,
): Promise<{ view: EsimView | null; refreshed: boolean; error?: string }> {
  const profile = await findOwnedEsim(userId, esimId);
  if (!profile) return { view: null, refreshed: false };
  const last = profile.lifecycle?.lastUsageUpdateAt?.getTime() ?? 0;
  const done = async (refreshed: boolean, error?: string) => ({
    view: view(profile, (await plansFor([profile])).get(String(profile.plan))),
    refreshed,
    error,
  });
  if (Date.now() - last < REFRESH_EVERY_MS) return done(false, "Updated less than a minute ago");
  const { refreshed, error } = await refreshEsimProfile(profile);
  return done(refreshed, error);
}

/**
 * Reads the eSIM's usage and lifecycle from its supplier into the profile
 * and its base package — for the shopper's refresh and the admin's alike.
 * A failed call keeps the stored snapshot and says why.
 */
export async function refreshEsimProfile(profile: IEsimProfile): Promise<{ refreshed: boolean; error?: string }> {
  const done = async (refreshed: boolean, error?: string) => ({ refreshed, error });
  if (profile.status !== "fulfilled") return done(false, "This eSIM has not been issued");

  const provider = await EsimProvider.findOne({ code: profile.providerCode }).select("+secretCredentials");
  if (!provider) return done(false, "Supplier is no longer available");
  const ref = { providerEsimId: profile.providerEsimId, simId: profile.simId, iccid: profile.iccid };
  const context = {
    provider: provider._id as mongoose.Types.ObjectId,
    providerCode: provider.code,
    refs: { esimId: String(profile._id), orderId: String(profile.order) },
  };

  let usage: ProviderUsage | null = null;
  let esim: ProviderEsim | null = null;
  let error: string | undefined;
  try {
    const adapter = adapterFor(provider);
    [usage, esim] = await Promise.all([
      withProviderLog({ ...context, operation: "usage" }, () => adapter.getUsage(ref), (value) => ({
        totalBytes: value.totalBytes, remainingBytes: value.remainingBytes, lifecycleStatus: value.lifecycleStatus,
      })).catch((reason: unknown) => {
        error = reason instanceof Error ? reason.message : String(reason);
        return null;
      }),
      withProviderLog({ ...context, operation: "esim" }, () => adapter.getEsim(ref), (value) => ({
        status: value.status, lifecycle: value.lifecycle,
      })).catch(() => null),
    ]);
  } catch (reason) {
    error = reason instanceof ProviderError ? reason.message : "Supplier could not be reached";
  }

  const now = new Date();
  profile.set("lifecycle.lastUsageUpdateAt", now);
  if (esim) {
    profile.set("lifecycle.status", esim.lifecycle.status ?? profile.lifecycle.status);
    profile.set("lifecycle.profileStatus", esim.lifecycle.profileStatus ?? profile.lifecycle.profileStatus);
    profile.set("lifecycle.installed", esim.lifecycle.installed ?? profile.lifecycle.installed);
    profile.set("lifecycle.installationDetectedAt", toDate(esim.lifecycle.installationDetectedAt) ?? profile.lifecycle.installationDetectedAt);
    profile.set("lifecycle.activationDetectedAt", toDate(esim.lifecycle.activationDetectedAt) ?? profile.lifecycle.activationDetectedAt);
    profile.set("lifecycle.lastStatusUpdateAt", now);
    if (esim.expiresAt) profile.expiresAt = toDate(esim.expiresAt);
    if (esim.activationDeadline) profile.activationDeadline = toDate(esim.activationDeadline);
  }
  if (usage) {
    profile.usage = {
      totalBytes: usage.totalBytes,
      usedBytes: usage.usedBytes,
      remainingBytes: usage.remainingBytes,
      expiresAt: toDate(usage.expiresAt),
      syncedAt: toDate(usage.syncedAt) ?? now,
      stale: usage.stale,
    };
    if (usage.lifecycleStatus) profile.set("lifecycle.status", usage.lifecycleStatus);
    if (usage.expiresAt) profile.expiresAt = toDate(usage.expiresAt);
    await EsimPackage.updateOne(
      { esim: profile._id, kind: "base" },
      {
        $set: {
          dataTotalBytes: usage.totalBytes || null,
          dataRemainingBytes: usage.remainingBytes,
          expiresAt: profile.expiresAt,
          status:
            usage.lifecycleStatus === "expired" ? "expired"
              : usage.lifecycleStatus === "depleted" ? "depleted"
                : usage.lifecycleStatus === "in_use" ? "active"
                  : "new",
        },
      },
    );
  }
  await profile.save();
  // An eSIM that came without an ICCID (Stellar, migrated ones) takes it once its supplier names one.
  if (!profile.iccid && esim?.iccid && (await fillMissingIccid(profile._id, esim.iccid).catch(() => false))) {
    profile.iccid = esim.iccid;
  }
  // What the supplier last said, beside the order's own raw record: for a
  // person checking an eSIM whose state or top-ups look wrong.
  const latest = { at: now, usage: usage?.raw ?? null, esim: esim?.raw ?? null, error: error ?? null };
  await EsimProfile.updateOne({ _id: profile._id, raw: { $type: "object" } }, { $set: { "raw.latest": latest } })
    .then(async (result) => {
      if (!result.matchedCount) await EsimProfile.updateOne({ _id: profile._id }, [{ $set: { raw: { order: "$raw", latest: { $literal: latest } } } }]);
    })
    .catch((reason: unknown) => console.error("[esim] keeping the supplier's answer failed:", reason));
  return done(Boolean(usage || esim), error);
}

/** How long opening the eSIM page waits for the supplier before showing what is stored. */
const OPEN_REFRESH_WAIT_MS = 4_000;

/**
 * The eSIM as its page opens (USR-02): asked of the supplier first (at most
 * once a minute, like the refresh button), so status and data left are
 * current, but never holding the page up past a few seconds. Null when it is
 * not the shopper's.
 */
export async function getCustomerEsimFresh(userId: string, esimId: string): Promise<EsimView | null> {
  const stored = getCustomerEsim(userId, esimId);
  const refreshed = refreshCustomerEsim(userId, esimId)
    .then((result) => result.view)
    .catch(() => null);
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), OPEN_REFRESH_WAIT_MS));
  return (await Promise.race([refreshed, late])) ?? stored;
}
