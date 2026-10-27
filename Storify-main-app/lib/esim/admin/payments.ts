import "server-only";

import { revalidateTag } from "next/cache";
import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-invalidation";
import { EsimPayment, EsimPaymentMethod, type IEsimPayment, type IEsimPaymentMethod } from "@/models/esim-payment.model";
import { encryptCredential } from "@/lib/esim/secrets";
import { paymentMethodDefinition, PAYMENT_METHOD_DEFINITIONS } from "@/lib/esim/payments/registry";
import { definedMethodCodes, methodCredentials, missingCredentials } from "@/lib/esim/payments/service";

/**
 * Admin → eSIM → Payments (PAY, patch P15): the payment methods behind
 * Storify's "extension" gateway — switch on, settings, order on the page —
 * and the payments themselves, with the ones that need money sent back.
 * Secrets never leave the server: the page only learns which are set.
 */

export interface AdminPaymentMethod {
  code: string;
  name: string;
  defaultName: string;
  status: "active" | "disabled";
  sort: number;
  credentialKeys: string[];
  secretKeys: string[];
  credentialsSet: Record<string, boolean>;
  credentialValues: Record<string, string>;
  /** Defaults the plugin uses when a field is left empty. */
  defaults: Record<string, string>;
  missing: string[];
  notifyPath: string;
}

function view(code: string, row: IEsimPaymentMethod | null): AdminPaymentMethod {
  const definition = paymentMethodDefinition(code)!;
  const { credentialKeys, secretKeys } = definition.plugin;
  let missing: string[];
  try {
    missing = missingCredentials(definition, methodCredentials(definition, row));
  } catch {
    missing = ["(cannot decrypt — enter the secrets again)"];
  }
  return {
    code,
    name: row?.name || definition.displayName,
    defaultName: definition.displayName,
    status: row?.status ?? "disabled",
    sort: row?.sort ?? 100,
    credentialKeys: [...credentialKeys],
    secretKeys: [...secretKeys],
    credentialsSet: Object.fromEntries(credentialKeys.map((key) => [key, Boolean(row?.credentials.get(key) || row?.secretCredentials?.get(key))])),
    credentialValues: Object.fromEntries(credentialKeys.filter((key) => !secretKeys.includes(key)).map((key) => [key, row?.credentials.get(key) ?? ""])),
    defaults: definition.defaults,
    missing,
    notifyPath: `/api/esim/pay/notify/${code}`,
  };
}

export async function listAdminPaymentMethods(): Promise<AdminPaymentMethod[]> {
  await connectDB();
  const rows = await EsimPaymentMethod.find({ code: { $in: definedMethodCodes() } }).select("+secretCredentials");
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return definedMethodCodes()
    .map((code) => view(code, byCode.get(code) ?? null))
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
}

export interface PaymentMethodUpdate {
  name?: string;
  status?: "active" | "disabled";
  sort?: number;
  /** Only the keys sent change; an empty string clears one. */
  credentials?: Record<string, string>;
}

/** Creates the method on first save. Returns what changed, secrets as "set"/"cleared". */
export async function updatePaymentMethod(code: string, update: PaymentMethodUpdate) {
  await connectDB();
  const definition = paymentMethodDefinition(code);
  if (!definition || !(code in PAYMENT_METHOD_DEFINITIONS)) throw new Error(`Unknown payment method "${code}"`);
  const row =
    (await EsimPaymentMethod.findOne({ code }).select("+secretCredentials")) ?? new EsimPaymentMethod({ code, status: "disabled" });
  const before = { name: row.name, status: row.status, sort: row.sort };
  if (update.name !== undefined) row.name = update.name.trim();
  if (update.sort !== undefined) row.sort = update.sort;
  const changes: Record<string, string> = {};
  for (const [key, raw] of Object.entries(update.credentials ?? {})) {
    if (!definition.plugin.credentialKeys.includes(key)) continue;
    const value = raw.trim();
    const secret = definition.plugin.secretKeys.includes(key);
    const target = secret ? row.secretCredentials : row.credentials;
    if (!value) target.delete(key);
    else if (secret) row.secretCredentials.set(key, encryptCredential(value));
    else row.credentials.set(key, value);
    changes[key] = secret ? (value ? "set" : "cleared") : value;
  }
  row.markModified("credentials");
  row.markModified("secretCredentials");
  if (update.status !== undefined) {
    if (update.status === "active" && missingCredentials(definition, methodCredentials(definition, row)).length) {
      throw new Error("Fill in this method's settings before switching it on");
    }
    row.status = update.status;
  }
  await row.save();
  // Checkout reads whether to offer the method from the cached public settings.
  revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  return {
    before,
    after: { name: row.name, status: row.status, sort: row.sort, ...(Object.keys(changes).length ? { credentials: changes } : {}) },
  };
}

export interface AdminPayment {
  id: string;
  reference: string;
  method: string;
  amountMinor: number;
  currency: string;
  state: string;
  email: string | null;
  gatewayPaymentId: string | null;
  outcome: string | null;
  orderId: string | null;
  orderNumber: string | null;
  error: string | null;
  needsRefund: boolean;
  refundedAt: string | null;
  createdAt: string;
  paidAt: string | null;
}

const needsRefund = (row: Pick<IEsimPayment, "settlement" | "refundedAt">) =>
  !row.refundedAt && (row.settlement?.outcome === "duplicate" || row.settlement?.outcome === "closed");

/** The latest payments; `attention` keeps the ones paid but unsettled, with an error, or owed back. */
export async function listAdminPayments(filter: { attention?: boolean; limit?: number } = {}): Promise<AdminPayment[]> {
  await connectDB();
  const query: QueryFilter<IEsimPayment> = filter.attention
    ? {
        $or: [
          { state: "paid", settlement: { $exists: false } },
          { error: { $exists: true, $ne: "" } },
          { "settlement.outcome": { $in: ["duplicate", "closed"] }, refundedAt: { $exists: false } },
        ],
      }
    : {};
  const rows = await EsimPayment.find(query).sort({ createdAt: -1 }).limit(filter.limit ?? 100).lean<IEsimPayment[]>();
  return rows.map((row) => ({
    id: String(row._id),
    reference: row.reference,
    method: row.method,
    amountMinor: row.amountMinor,
    currency: row.currency,
    state: row.state,
    email: row.email ?? null,
    gatewayPaymentId: row.gatewayPaymentId ?? null,
    outcome: row.settlement?.outcome ?? null,
    orderId: row.settlement?.orderId ? String(row.settlement.orderId) : null,
    orderNumber: row.settlement?.orderNumber ?? null,
    error: row.error ?? null,
    needsRefund: needsRefund(row),
    refundedAt: row.refundedAt ? new Date(row.refundedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
  }));
}

/** The money for a duplicate or closed-checkout payment was sent back by hand. */
export async function markPaymentRefunded(id: string) {
  await connectDB();
  const row = await EsimPayment.findOneAndUpdate(
    { _id: id, "settlement.outcome": { $in: ["duplicate", "closed"] }, refundedAt: { $exists: false } },
    { $set: { refundedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!row) throw new Error("This payment has nothing to refund, or is already marked refunded");
  return { reference: row.reference, amountMinor: row.amountMinor, currency: row.currency };
}
