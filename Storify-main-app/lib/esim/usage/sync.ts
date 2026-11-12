import "server-only";

import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { refreshEsimProfile } from "@/lib/esim/account/esims";
import { dueReminders, syncIntervalMs, type ReminderKind } from "@/lib/esim/reminders/policy";
import { sendReminders } from "@/lib/esim/reminders/send";
import { topupEligibility } from "@/lib/esim/topup/eligibility";
import { alertSupplierProblem } from "@/lib/esim/alerts";
import type { LifecycleStatus } from "@/lib/esim/providers/types";
import { mongoose } from "@/lib/db";

/**
 * The `esim-usage` cron (USR-04 kept fresh, NTF-03/04/05/07): asks suppliers
 * for the usage and status of live eSIMs — hourly while in use, every three
 * hours once installed, twice a day while waiting to be installed — then
 * sends whatever reminders are due. eSIMs whose end or install-by date is
 * near are looked at too, even when not due a supplier call.
 *
 * A run does at most `limit` eSIMs within `budgetMs`; the oldest-synced go
 * first, so a backlog drains over a few runs. A supplier failing most of its
 * calls in a run is reported to the admins (NTF-09), once a day.
 */

const SHORTEST_INTERVAL_MS = 60 * 60_000;
const LIVE: Array<LifecycleStatus | null> = ["in_use", "installed", "not_installed", null];

export interface UsageSyncResult {
  checked: number;
  synced: number;
  failed: number;
  reminders: Partial<Record<ReminderKind, number>>;
  supplierFailures: Record<string, { calls: number; failed: number }>;
}

/** `only`: these eSIMs and no others (the dev check script, so it never touches real ones). */
export async function runUsageSync(
  options: { limit?: number; budgetMs?: number; now?: Date; only?: mongoose.Types.ObjectId[] } = {},
): Promise<UsageSyncResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 200;
  const deadline = Date.now() + (options.budgetMs ?? 50_000);
  const settings = (await getEsimSettings()).reminders ?? { enabled: true, lowDataPercent: 20, expiringHours: 24, installDays: 3 };
  const result: UsageSyncResult = { checked: 0, synced: 0, failed: 0, reminders: {}, supplierFailures: {} };

  const scope: { _id?: { $in: mongoose.Types.ObjectId[] } } = options.only ? { _id: { $in: options.only } } : {};
  const syncDue: IEsimProfile[] = await EsimProfile.find({
    ...scope,
    status: "fulfilled",
    "lifecycle.status": { $in: LIVE },
    $or: [{ usageSyncedAt: null }, { usageSyncedAt: { $lt: new Date(now.getTime() - SHORTEST_INTERVAL_MS) } }],
  })
    .sort({ usageSyncedAt: 1 })
    .limit(limit * 2);
  const dateDue: IEsimProfile[] = settings.enabled
    ? await EsimProfile.find({
        ...scope,
        status: "fulfilled",
        "lifecycle.status": { $nin: ["expired", "cancelled"] },
        $or: [
          { expiresAt: { $gt: now, $lte: new Date(now.getTime() + settings.expiringHours * 3_600_000) } },
          { activationDeadline: { $gt: now, $lte: new Date(now.getTime() + settings.installDays * 86_400_000) } },
        ],
      }).limit(limit)
    : [];
  const byId = new Map<string, IEsimProfile>();
  for (const profile of [...dateDue, ...syncDue]) byId.set(String(profile._id), profile);

  const plans = new Map(
    (await EsimPlan.find({ _id: { $in: [...byId.values()].map((profile) => profile.plan) } }).select({ name: 1, topup: 1, data: 1 }).lean<IEsimPlan[]>())
      .map((plan) => [String(plan._id), plan]),
  );

  for (const profile of byId.values()) {
    if (result.checked >= limit || Date.now() > deadline) break;
    result.checked += 1;
    const previous = profile.lifecycle?.status ?? null;
    const interval = syncIntervalMs(previous);
    const last = profile.usageSyncedAt?.getTime() ?? 0;
    let looked = false;
    if (interval !== null && now.getTime() - last >= interval) {
      const outcome = await refreshEsimProfile(profile).catch((error: unknown) => ({ refreshed: false, error: String(error) }));
      await EsimProfile.updateOne({ _id: profile._id }, { $set: { usageSyncedAt: new Date() } });
      const tally = (result.supplierFailures[profile.providerCode] ??= { calls: 0, failed: 0 });
      tally.calls += 1;
      if (outcome.refreshed) {
        result.synced += 1;
        looked = true;
      } else {
        result.failed += 1;
        tally.failed += 1;
      }
    }

    const plan = plans.get(String(profile.plan)) ?? null;
    const due = dueReminders(
      {
        lifecycle: profile.lifecycle?.status ?? null,
        previousLifecycle: looked ? previous : undefined,
        installed: profile.lifecycle?.installed ?? null,
        counted: ["total", "lifetime", undefined].includes(plan?.data.type ?? profile.legacyPlan?.dataType),
        totalBytes: profile.usage?.totalBytes ?? null,
        remainingBytes: profile.usage?.remainingBytes ?? null,
        expiresAt: profile.expiresAt,
        activationDeadline: profile.activationDeadline,
        sent: {
          activatedAt: profile.reminders?.activatedAt ?? null,
          lowDataForTotal: profile.reminders?.lowDataForTotal ?? null,
          expiringFor: profile.reminders?.expiringFor ?? null,
          installDeadlineFor: profile.reminders?.installDeadlineFor ?? null,
        },
      },
      settings,
      now,
    );
    if (!due.length) continue;
    const canTopup = Boolean(
      plan &&
        topupEligibility({
          rule: plan.topup,
          supplierSellsTopups: true,
          status: profile.status,
          lifecycle: profile.lifecycle?.status ?? null,
          expiresAt: profile.expiresAt,
          topupDeadline: profile.topupDeadline,
          profileExpiresAt: profile.profileExpiresAt,
        }, now).ok,
    );
    for (const kind of await sendReminders(profile, due, plan, { canTopup })) {
      result.reminders[kind] = (result.reminders[kind] ?? 0) + 1;
    }
  }

  // A supplier that failed most of a meaningful number of calls is worth a person's look.
  for (const [code, tally] of Object.entries(result.supplierFailures)) {
    if (tally.calls >= 3 && tally.failed / tally.calls >= 0.5) {
      await alertSupplierProblem(code, "usage", `${tally.failed} of ${tally.calls} usage checks failed in the last run.`);
    }
  }
  return result;
}
