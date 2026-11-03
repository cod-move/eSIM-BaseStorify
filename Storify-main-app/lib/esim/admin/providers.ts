import "server-only";

import { connectDB } from "@/lib/db";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProvider, type IEsimProvider } from "@/models/esim-provider.model";
import { adapterFor, applyCredentials, findProvider } from "@/lib/esim/provider-service";
import { syncProviderCatalog } from "@/lib/esim/catalog/sync";
import { PROVIDER_DEFINITIONS, isProviderCode, sellsEsimPlans } from "@/lib/esim/providers/registry";

/**
 * Admin → eSIM → Suppliers (ADM-01): the list, switching a supplier on and
 * off, its credentials and priority, testing the connection (which also
 * reports the balance where the supplier's check returns one) and syncing
 * the catalogue. Secrets never leave the server: the page only learns which
 * credentials are set.
 */

export interface AdminProvider {
  code: string;
  name: string;
  status: "active" | "disabled";
  priority: number;
  settlementCurrency: string;
  credentialKeys: string[];
  secretKeys: string[];
  /** Which credentials hold a value. */
  credentialsSet: Record<string, boolean>;
  /** Plain (non-secret) credential values, for the form. */
  credentialValues: Record<string, string>;
  plans: { total: number; active: number; available: number };
  lastSync: { startedAt: string; finishedAt: string | null; status: string; seen: number; created: number; updated: number; retired: number; error: string | null } | null;
  lastProbe: { at: string; ok: boolean; message: string } | null;
  known: boolean;
  /** The number-card gateway: no catalogue, so no sync or plan counts. */
  numbersOnly: boolean;
}

const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);

function view(provider: IEsimProvider, counts: Map<string, { total: number; active: number; available: number }>): AdminProvider {
  const definition = isProviderCode(provider.code) ? PROVIDER_DEFINITIONS[provider.code] : null;
  const credentialKeys = [...(definition?.credentialKeys ?? [...provider.credentials.keys()])];
  const secretKeys = [...(definition?.secretKeys ?? [])];
  return {
    code: provider.code,
    name: provider.name,
    status: provider.status,
    priority: provider.priority,
    settlementCurrency: provider.settlementCurrency,
    credentialKeys,
    secretKeys,
    credentialsSet: Object.fromEntries(
      credentialKeys.map((key) => [key, Boolean(provider.credentials.get(key) || provider.secretCredentials?.get(key))]),
    ),
    credentialValues: Object.fromEntries(
      credentialKeys.filter((key) => !secretKeys.includes(key)).map((key) => [key, provider.credentials.get(key) ?? ""]),
    ),
    plans: counts.get(provider.code) ?? { total: 0, active: 0, available: 0 },
    lastSync: provider.lastSync
      ? {
          startedAt: iso(provider.lastSync.startedAt)!,
          finishedAt: iso(provider.lastSync.finishedAt),
          status: provider.lastSync.status,
          seen: provider.lastSync.seen ?? 0,
          created: provider.lastSync.created ?? 0,
          updated: provider.lastSync.updated ?? 0,
          retired: provider.lastSync.retired ?? 0,
          error: provider.lastSync.error ?? null,
        }
      : null,
    lastProbe: provider.lastProbe ? { at: iso(provider.lastProbe.at)!, ok: provider.lastProbe.ok, message: provider.lastProbe.message } : null,
    known: Boolean(definition),
    numbersOnly: !sellsEsimPlans(provider.code),
  };
}

async function planCounts() {
  const rows = await EsimPlan.aggregate<{ _id: string; total: number; active: number; available: number }>([
    {
      $group: {
        _id: "$providerCode",
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        available: { $sum: { $cond: ["$available", 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [row._id, { total: row.total, active: row.active, available: row.available }]));
}

/** Every supplier: the configured ones, then those the module knows but nobody set up yet. */
export async function listAdminProviders(): Promise<AdminProvider[]> {
  await connectDB();
  const [providers, counts] = await Promise.all([
    EsimProvider.find({ code: { $not: /^fake/ } }).select("+secretCredentials").sort({ priority: 1, code: 1 }),
    planCounts(),
  ]);
  const listed = providers.map((provider) => view(provider, counts));
  const missing = Object.entries(PROVIDER_DEFINITIONS)
    .filter(([code]) => !providers.some((provider) => provider.code === code))
    .map(([code, definition]): AdminProvider => ({
      code,
      name: definition.displayName,
      status: "disabled",
      priority: 100,
      settlementCurrency: "USD",
      credentialKeys: [...definition.credentialKeys],
      secretKeys: [...definition.secretKeys],
      credentialsSet: Object.fromEntries(definition.credentialKeys.map((key) => [key, false])),
      credentialValues: Object.fromEntries(definition.credentialKeys.filter((key) => !(definition.secretKeys as readonly string[]).includes(key)).map((key) => [key, ""])),
      plans: { total: 0, active: 0, available: 0 },
      lastSync: null,
      lastProbe: null,
      known: true,
      numbersOnly: !sellsEsimPlans(code),
    }));
  return [...listed, ...missing];
}

export interface ProviderUpdate {
  name?: string;
  status?: "active" | "disabled";
  priority?: number;
  settlementCurrency?: string;
  /** Only the keys sent change; an empty string clears one. */
  credentials?: Record<string, string>;
}

/** Creates the supplier on first save. Returns what changed, secrets as "set"/"cleared". */
export async function updateProvider(code: string, update: ProviderUpdate) {
  await connectDB();
  if (!isProviderCode(code)) throw new Error(`Unknown supplier "${code}"`);
  const definition = PROVIDER_DEFINITIONS[code];
  const provider =
    (await findProvider(code)) ??
    new EsimProvider({ code, name: definition.displayName, status: "disabled", settlementCurrency: update.settlementCurrency ?? "USD" });
  const before = { name: provider.name, status: provider.status, priority: provider.priority, settlementCurrency: provider.settlementCurrency };
  if (update.name !== undefined) provider.name = update.name.trim() || definition.displayName;
  if (update.status !== undefined) provider.status = update.status;
  if (update.priority !== undefined) provider.priority = update.priority;
  if (update.settlementCurrency !== undefined) provider.settlementCurrency = update.settlementCurrency.toUpperCase();
  const credentialChanges: Record<string, string> = {};
  if (update.credentials) {
    const allowed = Object.fromEntries(
      Object.entries(update.credentials).filter(([key]) => (definition.credentialKeys as readonly string[]).includes(key)),
    );
    applyCredentials(provider, allowed);
    for (const [key, value] of Object.entries(allowed)) {
      credentialChanges[key] = (definition.secretKeys as readonly string[]).includes(key) ? (value ? "set" : "cleared") : value;
    }
  }
  await provider.save();
  return {
    before,
    after: { name: provider.name, status: provider.status, priority: provider.priority, settlementCurrency: provider.settlementCurrency, ...(Object.keys(credentialChanges).length ? { credentials: credentialChanges } : {}) },
  };
}

/** One authenticated call; the result is kept on the supplier for the list. */
export async function probeProvider(code: string) {
  await connectDB();
  const provider = await findProvider(code);
  if (!provider) throw new Error(`Supplier "${code}" is not set up`);
  try {
    const result = await adapterFor(provider).probe();
    provider.lastProbe = { at: new Date(), ok: true, message: result.message.slice(0, 500) };
    return { ok: true, message: result.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    provider.lastProbe = { at: new Date(), ok: false, message: message.slice(0, 500) };
    return { ok: false, message };
  } finally {
    await provider.save();
  }
}

/**
 * Marks the sync running and returns the work to run after the response: a
 * large catalogue takes minutes. A sync already running is not started again
 * unless it has been running for over an hour (a crashed one).
 */
export async function startProviderSync(code: string): Promise<(() => Promise<void>) | null> {
  await connectDB();
  const provider = await findProvider(code);
  if (!provider) throw new Error(`Supplier "${code}" is not set up`);
  const running =
    provider.lastSync?.status === "running" && Date.now() - new Date(provider.lastSync.startedAt).getTime() < 3_600_000;
  if (running) return null;
  return async () => {
    try {
      await syncProviderCatalog(provider);
    } catch (error) {
      console.error(`eSIM catalogue sync for ${code} failed:`, error);
    }
  };
}
