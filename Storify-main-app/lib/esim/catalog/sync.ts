import "server-only";

import { createHash } from "node:crypto";
import type { AnyBulkWriteOperation } from "mongoose";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimProvider, type IEsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { sellsEsimPlans } from "@/lib/esim/providers/registry";
import type { ProviderPlan, TopupRule } from "@/lib/esim/providers/types";
import { destinationKey } from "@/lib/esim/catalog/destination-key";
import { destinationMerges, recordAutoAliases } from "@/lib/esim/catalog/merge";

/**
 * Pulls a supplier's whole catalogue into `EsimPlan` (CAT-03).
 *
 * - One sync per supplier at a time: a run claims `lastSync` atomically, and a
 *   claim older than LOCK_STALE_MS is presumed dead and taken over.
 * - Unchanged plans cost one batched `syncedAt` touch, not a rewrite.
 * - Only a scan that reached the end retires plans the supplier no longer
 *   lists; a scan that failed half-way retires nothing, because "not seen"
 *   would then mean "not reached".
 * - Platform fields (status, retail price, product link, KYC) are written only
 *   on insert and never touched again by a sync.
 * - A plan is filed under its destination as lib/esim/catalog/destination-key.ts
 *   says (its country, or where an admin merged it); the supplier's own slug
 *   is kept as `supplierProductSlug`.
 */

const BATCH_SIZE = 200;
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

export interface SyncResult {
  provider: string;
  status: "ok" | "failed" | "skipped";
  seen: number;
  created: number;
  updated: number;
  retired: number;
  error?: string;
}

/**
 * The plan as stored: the supplier's data with the provider's top-up override
 * applied, filed under its destination (`merges`: the admin's, from → into).
 */
export function planDocument(plan: ProviderPlan, override?: Partial<TopupRule>, merges?: ReadonlyMap<string, string>) {
  const { raw, providerUpdatedAt, ...fields } = plan;
  const topup = override ? { ...fields.topup, ...override } : fields.topup;
  const normalized = { ...fields, ...destinationKey(fields, merges), supplierProductSlug: fields.productSlug, topup };
  return {
    normalized: {
      ...normalized,
      providerUpdatedAt: providerUpdatedAt ? new Date(providerUpdatedAt) : null,
    },
    raw,
    contentHash: createHash("sha256")
      .update(JSON.stringify({ ...normalized, providerUpdatedAt }))
      .digest("hex"),
  };
}

async function claim(provider: IEsimProvider, startedAt: Date) {
  return EsimProvider.findOneAndUpdate(
    {
      _id: provider._id,
      $or: [
        { "lastSync.status": { $ne: "running" } },
        { "lastSync.startedAt": { $lt: new Date(startedAt.getTime() - LOCK_STALE_MS) } },
      ],
    },
    { $set: { lastSync: { startedAt, status: "running" } } },
    { returnDocument: "after" },
  );
}

export async function syncProviderCatalog(provider: IEsimProvider): Promise<SyncResult> {
  const startedAt = new Date();
  const result: SyncResult = {
    provider: provider.code,
    status: "ok",
    seen: 0,
    created: 0,
    updated: 0,
    retired: 0,
  };

  if (!(await claim(provider, startedAt))) {
    return { ...result, status: "skipped", error: "Another sync of this provider is running" };
  }

  const known = new Map<string, string>();
  for await (const row of EsimPlan.find({ provider: provider._id })
    .select({ providerPlanId: 1, contentHash: 1 })
    .lean<Pick<IEsimPlan, "providerPlanId" | "contentHash">[]>()
    .cursor()) {
    known.set(row.providerPlanId, row.contentHash);
  }

  const merges = await destinationMerges();
  const moved = new Map<string, string>();
  let writes: AnyBulkWriteOperation<IEsimPlan>[] = [];
  let unchanged: string[] = [];
  const flush = async () => {
    if (writes.length) {
      const outcome = await EsimPlan.bulkWrite(writes, { ordered: false });
      result.created += outcome.upsertedCount;
      result.updated += outcome.modifiedCount;
      writes = [];
    }
    if (unchanged.length) {
      await EsimPlan.updateMany(
        { provider: provider._id, providerPlanId: { $in: unchanged } },
        { $set: { syncedAt: startedAt } },
      );
      unchanged = [];
    }
  };

  try {
    const adapter = adapterFor(provider);
    for await (const plan of adapter.listPlans()) {
      result.seen += 1;
      const { normalized, raw, contentHash } = planDocument(plan, provider.topupOverride, merges);
      const own = destinationKey(plan).productSlug;
      if (own !== plan.productSlug) moved.set(plan.productSlug, own);
      if (known.get(plan.providerPlanId) === contentHash) {
        unchanged.push(plan.providerPlanId);
      } else {
        writes.push({
          updateOne: {
            filter: { provider: provider._id, providerPlanId: plan.providerPlanId },
            update: {
              $set: {
                ...normalized,
                providerCode: provider.code,
                raw,
                contentHash,
                syncedAt: startedAt,
              },
              $setOnInsert: {
                status: "disabled",
                retailPriceMinor: null,
                retailPriceManual: false,
                pricing: null,
                kycRequired: null,
                productId: null,
                variantId: null,
              },
            },
            upsert: true,
          },
        });
      }
      if (writes.length + unchanged.length >= BATCH_SIZE) await flush();
    }
    await flush();
    await recordAutoAliases(moved);

    const retired = await EsimPlan.updateMany(
      { provider: provider._id, syncedAt: { $lt: startedAt }, available: true },
      { $set: { available: false } },
    );
    result.retired = retired.modifiedCount;
  } catch (error) {
    await flush().catch(() => undefined);
    result.status = "failed";
    result.error = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  }

  const finishedAt = new Date();
  await EsimProvider.updateOne(
    { _id: provider._id, "lastSync.startedAt": startedAt },
    {
      $set: {
        lastSync: {
          startedAt,
          finishedAt,
          status: result.status,
          seen: result.seen,
          created: result.created,
          updated: result.updated,
          retired: result.retired,
          error: result.error,
        },
      },
    },
  );
  await EsimProviderLog.create({
    provider: provider._id,
    providerCode: provider.code,
    operation: "catalogue.sync",
    ok: result.status === "ok",
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    errorMessage: result.error,
    response: { ...result },
  }).catch((error) => console.error("[esim] provider log write failed:", error));

  return result;
}

/** Every active supplier, one after another (they share the connection pool). */
export async function syncAllCatalogs(): Promise<SyncResult[]> {
  const providers = await EsimProvider.find({ status: "active" }).select("+secretCredentials");
  const results: SyncResult[] = [];
  for (const provider of providers) {
    if (!sellsEsimPlans(provider.code)) continue;
    results.push(await syncProviderCatalog(provider));
  }
  return results;
}
