import "server-only";

import { connectDB } from "@/lib/db";
import { EsimLegacyImportRun, EsimLegacyLink, LEGACY_LINK_KINDS } from "@/models/esim-legacy.model";
import { describeLegacySource, legacySourceConfig, readLegacySnapshot } from "@/lib/esim/migration/legacy-source";
import { runLegacyImport } from "@/lib/esim/migration/import";

/**
 * Admin → eSIM → Migration (MIG): "Check" reads the old store and counts
 * what an import would do; "Import" does it. The old database is named only
 * in `.env` (LEGACY_MYSQL_*); the page shows where it points, never the
 * password, and reports counts, never people.
 */

export interface MigrationRunView {
  id: string;
  apply: boolean;
  status: string;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  report: Record<string, number> | null;
  skipped: Record<string, number> | null;
  error: string | null;
}

export interface MigrationStatus {
  source: string | null;
  running: boolean;
  imported: Record<string, number>;
  runs: MigrationRunView[];
}

/** A run counts as abandoned (a restarted server) after this long. */
const STALE_MS = 2 * 3_600_000;

export async function migrationStatus(): Promise<MigrationStatus> {
  await connectDB();
  const [runs, counts] = await Promise.all([
    EsimLegacyImportRun.find().sort({ startedAt: -1 }).limit(10).lean(),
    EsimLegacyLink.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$kind", count: { $sum: 1 } } }]),
  ]);
  const imported = Object.fromEntries(LEGACY_LINK_KINDS.map((kind) => [kind, counts.find((row) => row._id === kind)?.count ?? 0]));
  return {
    source: describeLegacySource(legacySourceConfig()),
    running: runs.some((run) => run.status === "running" && Date.now() - new Date(run.startedAt).getTime() < STALE_MS),
    imported,
    runs: runs.map((run) => ({
      id: String(run._id),
      apply: run.apply,
      status: run.status === "running" && Date.now() - new Date(run.startedAt).getTime() >= STALE_MS ? "failed" : run.status,
      startedBy: run.startedBy,
      startedAt: new Date(run.startedAt).toISOString(),
      finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
      report: run.report,
      skipped: run.skipped,
      error: run.error,
    })),
  };
}

export class MigrationError extends Error {}

/** Records the run and returns the work, to run after the response. */
export async function startMigrationRun(apply: boolean, startedBy: string) {
  await connectDB();
  const config = legacySourceConfig();
  if (!config) throw new MigrationError("The old database is not configured (LEGACY_MYSQL_HOST, LEGACY_MYSQL_DATABASE, LEGACY_MYSQL_USER in .env)");
  const busy = await EsimLegacyImportRun.exists({ status: "running", startedAt: { $gt: new Date(Date.now() - STALE_MS) } });
  if (busy) throw new MigrationError("A check or import is already running");
  const run = await EsimLegacyImportRun.create({ apply, startedBy, startedAt: new Date() });

  return async () => {
    try {
      const snapshot = await readLegacySnapshot(config);
      const result = await runLegacyImport(snapshot, apply ? await applyDependencies() : { apply: false });
      await EsimLegacyImportRun.updateOne({ _id: run._id }, { $set: { status: "done", finishedAt: new Date(), report: result.report, skipped: result.skipped } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Legacy import failed:", message);
      await EsimLegacyImportRun.updateOne({ _id: run._id }, { $set: { status: "failed", finishedAt: new Date(), error: message.slice(0, 1000) } });
    }
  };
}

/** What an import writes through: Storify's own store credit, profiles, referral codes. */
export async function applyDependencies() {
  const [{ issueStoreCredit }, { ensureCustomerProfile }, { ensureReferralCode, getReferralSettings }, { ensureMigratedProduct }, { getDefaultVendorIds }, { getSettings }] =
    await Promise.all([
      import("@/lib/store-credit/store-credit"),
      import("@/lib/customers/customer"),
      import("@/lib/esim/referral/service"),
      import("@/lib/esim/migration/product"),
      import("@/lib/finance/post-events"),
      import("@/models/settings.model"),
    ]);
  const currency = String((await getSettings()).general?.defaultCurrency || "USD").toUpperCase();
  return {
    apply: true,
    currency,
    product: await ensureMigratedProduct(),
    vendorId: [...(await getDefaultVendorIds())][0] ?? null,
    referralValidityDays: (await getReferralSettings()).validityDays,
    ensureReferralCode,
    ensureCustomerProfile,
    issueBalance: ({ customerId, amountMinor, currency: lotCurrency, legacyId }: { customerId: string; amountMinor: number; currency: string; legacyId: number }) =>
      issueStoreCredit({
        customerId,
        currency: lotCurrency,
        amount: amountMinor / 100,
        source: "wallet_topup",
        note: "Balance carried over from the old store",
        createdBy: "migration",
        idempotencyKey: `legacy-balance:${legacyId}`,
      }),
  };
}
