import "server-only";

import { randomUUID } from "node:crypto";
import { mongoose } from "@/lib/db";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { EsimFulfillment, type IEsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { decide, idempotencyKey, type Outcome } from "@/lib/esim/fulfillment/policy";
import { ProviderError, type ProviderEsim, type PurchaseResult } from "@/lib/esim/providers/types";
import { lineDays } from "@/lib/esim/cart/line-attributes";
import type { PerDayPricing } from "@/lib/esim/catalog/variants";

/**
 * Paid order → one supplier purchase per eSIM unit (ORD-05..09).
 *
 * `enqueueOrderFulfillment` only writes jobs — it is what runs inside payment
 * settlement, so it never calls a supplier. `processFulfillmentJobs` does the
 * buying, from `after()` right after payment and from the cron as a safety net.
 */

const LEASE_MS = 5 * 60_000;
type Line = { productId?: unknown; variantId?: unknown; vendorId?: unknown; quantity?: number; lineAttributes?: unknown };
type Consignment = { vendorId?: unknown; status?: string };

/**
 * Writes one queued job per unit of every eSIM line on a paid order.
 * Idempotent: the unique (order, line, unit) index makes a second call a no-op,
 * so a gateway retry or the cron replaying it cannot double the work.
 */
export async function enqueueOrderFulfillment(orderId: unknown): Promise<number> {
  const order = await Order.findById(orderId)
    .select({ orderNumber: 1, paymentStatus: 1, status: 1, items: 1, subOrders: 1 })
    .lean<{
      _id: mongoose.Types.ObjectId;
      orderNumber: string;
      paymentStatus: string;
      status: string;
      items: Line[];
      subOrders?: Consignment[];
    } | null>();
  if (!order || order.paymentStatus !== PAYMENT_STATUS.PAID || order.status === ORDER_STATUS.CANCELLED) {
    return 0;
  }
  const variantIds = order.items.map((item) => item.variantId).filter(Boolean) as mongoose.Types.ObjectId[];
  if (!variantIds.length) return 0;
  const links = await EsimProductLink.find({ "variants.variantId": { $in: variantIds } })
    .select({ variants: 1 })
    .lean();
  const candidatesByVariant = new Map<string, { candidates: mongoose.Types.ObjectId[]; perDay: PerDayPricing | null }>();
  for (const link of links) {
    for (const variant of link.variants) {
      candidatesByVariant.set(String(variant.variantId), { candidates: variant.candidates, perDay: variant.perDay ?? null });
    }
  }
  const cancelledSellers = new Set(
    (order.subOrders ?? [])
      .filter((sub) => sub.status === ORDER_STATUS.CANCELLED)
      .map((sub) => String(sub.vendorId ?? "")),
  );

  const now = new Date();
  const writes = order.items.flatMap((item, lineIndex) => {
    const published = candidatesByVariant.get(String(item.variantId ?? ""));
    const candidates = published?.candidates;
    // A day-priced line is bought for the days it was charged for (P10).
    const durationDays = published?.perDay ? lineDays(item.lineAttributes, published.perDay) : null;
    if (!candidates?.length || cancelledSellers.has(String(item.vendorId ?? ""))) return [];
    return Array.from({ length: Math.max(1, item.quantity ?? 1) }, (_, offset) => ({
      updateOne: {
        filter: { order: order._id, lineIndex, unit: offset + 1 },
        update: {
          $setOnInsert: {
            order: order._id,
            orderNumber: order.orderNumber,
            lineIndex,
            unit: offset + 1,
            variantId: item.variantId as mongoose.Types.ObjectId,
            candidates,
            durationDays,
            state: "queued" as const,
            nextAttemptAt: now,
            history: [{ at: now, event: "queued" }],
          },
        },
        upsert: true,
      },
    }));
  });
  if (!writes.length) return 0;
  const result = await EsimFulfillment.bulkWrite(writes, { ordered: false });
  return result.upsertedCount;
}

async function claim(filter: Record<string, unknown>, owner: string) {
  const now = new Date();
  return EsimFulfillment.findOneAndUpdate(
    {
      ...filter,
      state: { $in: ["queued", "provider_pending", "purchasing"] },
      nextAttemptAt: { $lte: now },
      $or: [{ lease: null }, { "lease.until": { $lt: now } }],
    },
    { $set: { lease: { owner, until: new Date(now.getTime() + LEASE_MS) } } },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } },
  );
}

function outcomeOf(result: PurchaseResult): Outcome {
  if (result.status === "fulfilled" && result.esim) return { kind: "fulfilled" };
  if (result.status === "failed") return { kind: "error", code: "rejected", message: "Supplier reports the order failed" };
  return { kind: "processing", providerOrderId: result.providerOrderId };
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** before_expiry plans die with their package; while_profile_exists ones do not. */
function deadlines(plan: IEsimPlan, expiresAt: Date | null) {
  const beforeExpiry = plan.topup.window === "before_expiry" || !plan.topup.supported;
  return {
    topupDeadline: plan.topup.supported && plan.topup.window === "before_expiry" ? expiresAt : null,
    profileExpiresAt: beforeExpiry ? expiresAt : null,
  };
}

async function recordEsim(job: IEsimFulfillment, plan: IEsimPlan, result: PurchaseResult, esim: ProviderEsim) {
  const order = await Order.findById(job.order).select({ customerId: 1, guestEmail: 1 }).lean<{
    customerId?: unknown;
    guestEmail?: string;
  } | null>();
  const customer = order?.customerId && mongoose.isValidObjectId(order.customerId) && !order.guestEmail
    ? new mongoose.Types.ObjectId(String(order.customerId))
    : null;
  const expiresAt = toDate(esim.expiresAt);
  const purchasedAt = new Date();
  const fields = {
    customer,
    email: order?.guestEmail?.toLowerCase() ?? null,
    orderNumber: job.orderNumber,
    plan: plan._id,
    providerCode: plan.providerCode,
    providerOrderId: result.providerOrderId,
    providerEsimId: esim.providerEsimId,
    simId: esim.simId,
    iccid: esim.iccid,
    status: esim.status,
    usageAvailable: esim.usageAvailable,
    lifecycle: {
      ...esim.lifecycle,
      installationDetectedAt: toDate(esim.lifecycle.installationDetectedAt),
      activationDetectedAt: toDate(esim.lifecycle.activationDetectedAt),
      lastStatusUpdateAt: purchasedAt,
      lastUsageUpdateAt: null,
    },
    installation: esim.installation,
    customerLink: esim.customerLink,
    bundles: esim.bundles.map((bundle) => ({ ...bundle, expiresAt: toDate(bundle.expiresAt) })),
    fulfilledAt: toDate(esim.fulfilledAt) ?? purchasedAt,
    durationDays: plan.duration.configurable ? job.durationDays : null,
    expiresAt,
    ...deadlines(plan, expiresAt),
    activationDeadline: plan.activation.preInstallDays
      ? new Date(purchasedAt.getTime() + plan.activation.preInstallDays * 86_400_000)
      : null,
    raw: esim.raw,
  };
  const profile = await EsimProfile.findOneAndUpdate(
    { order: job.order, lineIndex: job.lineIndex, unit: job.unit },
    { $set: fields, $setOnInsert: { order: job.order, lineIndex: job.lineIndex, unit: job.unit } },
    { upsert: true, returnDocument: "after" },
  );
  await EsimPackage.updateOne(
    { esim: profile!._id, kind: "base" },
    {
      $setOnInsert: {
        esim: profile!._id,
        plan: plan._id,
        kind: "base",
        dataTotalBytes: plan.data.type === "total" ? plan.data.megabytes * 1024 * 1024 : null,
        dataRemainingBytes: plan.data.type === "total" ? plan.data.megabytes * 1024 * 1024 : null,
        validityDays: (plan.duration.configurable ? job.durationDays : null) ?? plan.validityDays,
        expiresAt,
        status: "new",
      },
    },
    { upsert: true },
  );
  return profile!;
}

async function processOne(job: IEsimFulfillment, owner: string): Promise<IEsimFulfillment["state"]> {
  const planId = job.candidates[job.candidateIndex];
  const plan = await EsimPlan.findById(planId);
  const provider = plan ? await EsimProvider.findOne({ code: plan.providerCode }).select("+secretCredentials") : null;
  const now = new Date();

  let outcome: Outcome;
  let result: PurchaseResult | null = null;
  if (!plan || !provider) {
    outcome = { kind: "error", code: "not_found", message: "Plan or supplier no longer exists" };
  } else {
    await EsimFulfillment.updateOne(
      { _id: job._id, "lease.owner": owner },
      { $set: { state: "purchasing", providerCode: plan.providerCode }, $inc: { attempts: 1 } },
    );
    const pendingOrder = job.state === "provider_pending" ? job.providerOrderId : null;
    // A day-priced plan is bought for the days the line was charged for.
    const durationDays = plan.duration.configurable ? (job.durationDays ?? plan.duration.defaultDays) : null;
    try {
      const adapter = adapterFor(provider);
      result = await withProviderLog(
        {
          provider: provider._id as mongoose.Types.ObjectId,
          providerCode: provider.code,
          operation: pendingOrder ? "purchase.query" : "purchase",
          refs: { orderId: String(job.order), planId: String(plan._id) },
          request: pendingOrder ? { providerOrderId: pendingOrder } : { providerPlanId: plan.providerPlanId, durationDays },
        },
        () =>
          pendingOrder
            ? adapter.queryPurchase(pendingOrder)
            : adapter.purchase({
                providerPlanId: plan.providerPlanId,
                durationDays,
                idempotencyKey: idempotencyKey(String(job._id), String(plan._id)),
              }),
        (value) => ({ status: value.status, providerOrderId: value.providerOrderId, charged: value.charged }),
      );
      outcome = outcomeOf(result);
    } catch (error) {
      outcome = {
        kind: "error",
        code: error instanceof ProviderError ? error.code : "error",
        message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      };
    }
  }

  const decision = decide(
    {
      candidateIndex: job.candidateIndex,
      candidateCount: job.candidates.length,
      candidateAttempts: job.candidateAttempts,
      pendingSince: job.pendingSince,
    },
    outcome,
    now,
  );
  const event = (name: string, detail?: string) => ({ history: { at: now, event: name, ...(detail ? { detail } : {}) } });
  const error = outcome.kind === "error" ? { code: outcome.code, message: outcome.message, at: now } : null;

  switch (decision.action) {
    case "fulfilled": {
      const profile = await recordEsim(job, plan!, result!, result!.esim!);
      await EsimFulfillment.updateOne(
        { _id: job._id },
        {
          $set: { state: "fulfilled", profile: profile._id, providerOrderId: result!.providerOrderId, lease: null, lastError: null },
          $push: event("fulfilled", plan!.providerCode),
        },
      );
      return "fulfilled";
    }
    case "poll":
      await EsimFulfillment.updateOne(
        { _id: job._id },
        {
          $set: {
            state: "provider_pending",
            providerOrderId: decision.providerOrderId,
            pendingSince: decision.pendingSince,
            nextAttemptAt: decision.at,
            lease: null,
          },
          ...(job.pendingSince ? {} : { $push: event("provider_pending", decision.providerOrderId) }),
        },
      );
      return "provider_pending";
    case "retry":
      await EsimFulfillment.updateOne(
        { _id: job._id },
        {
          $set: { state: job.providerOrderId ? "provider_pending" : "queued", nextAttemptAt: decision.at, lease: null, lastError: error },
          $inc: { candidateAttempts: 1 },
          $push: event("retry", decision.reason),
        },
      );
      return "queued";
    case "failover":
      await EsimFulfillment.updateOne(
        { _id: job._id },
        {
          $set: {
            state: "queued",
            candidateIndex: decision.candidateIndex,
            candidateAttempts: 0,
            providerOrderId: null,
            pendingSince: null,
            nextAttemptAt: now,
            lease: null,
            lastError: error,
          },
          $push: event("failover", decision.reason),
        },
      );
      return "queued";
    case "fail":
      await EsimFulfillment.updateOne(
        { _id: job._id },
        { $set: { state: "failed", lease: null, lastError: error ?? { code: "failed", message: decision.reason, at: now } }, $push: event("failed", decision.reason) },
      );
      return "failed";
  }
}

export interface ProcessResult {
  processed: number;
  fulfilled: number;
  failed: number;
  orders: string[];
}

/**
 * Works due jobs until none are left, `limit` is reached or time runs out.
 * A failover is due at once, so one call usually carries a job through all
 * its candidates.
 */
export async function processFulfillmentJobs(
  options: { orderId?: unknown; limit?: number; budgetMs?: number } = {},
): Promise<ProcessResult> {
  const owner = randomUUID();
  const deadline = Date.now() + (options.budgetMs ?? 50_000);
  const filter = options.orderId ? { order: options.orderId } : {};
  const result: ProcessResult = { processed: 0, fulfilled: 0, failed: 0, orders: [] };
  const touched = new Set<string>();

  while (result.processed < (options.limit ?? 50) && Date.now() < deadline) {
    const job = await claim(filter, owner);
    if (!job) break;
    result.processed += 1;
    touched.add(String(job.order));
    const state = await processOne(job, owner);
    if (state === "fulfilled") result.fulfilled += 1;
    if (state === "failed") result.failed += 1;
  }
  result.orders = [...touched];
  return result;
}
