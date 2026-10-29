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
import { lineActivationDate, lineDays } from "@/lib/esim/cart/line-attributes";
import { supportsScheduledActivation } from "@/lib/esim/providers/registry";
import type { PerDayPricing } from "@/lib/esim/catalog/variants";
import { alertSupplierProblem, looksLikeBalanceProblem } from "@/lib/esim/alerts";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import { purchaseCostMinor, unitSaleMinor, usdMinorOf } from "@/lib/esim/reports/snapshot";
import type { EsimSaleSnapshot } from "@/models/esim-profile.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { reviewReasons } from "@/lib/esim/fulfillment/risk";

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
    .select({ orderNumber: 1, paymentStatus: 1, status: 1, items: 1, subOrders: 1, total: 1, customerId: 1, guestEmail: 1 })
    .lean<{
      _id: mongoose.Types.ObjectId;
      orderNumber: string;
      paymentStatus: string;
      status: string;
      items: Line[];
      subOrders?: Consignment[];
      total?: number;
      customerId?: unknown;
      guestEmail?: string | null;
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
  const reasons = await holdReasons(order);
  const held = reasons.length > 0;
  const writes = order.items.flatMap((item, lineIndex) => {
    const published = candidatesByVariant.get(String(item.variantId ?? ""));
    const candidates = published?.candidates;
    // A day-priced line is bought for the days it was charged for (P10).
    const durationDays = published?.perDay ? lineDays(item.lineAttributes, published.perDay) : null;
    // ORD-03: the start date the line was checked out with.
    const activationDate = lineActivationDate(item.lineAttributes);
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
            activationDate,
            state: held ? ("review" as const) : ("queued" as const),
            nextAttemptAt: now,
            review: held ? { reasons, heldAt: now, decision: null, decidedAt: null, decidedBy: null } : null,
            history: [{ at: now, event: held ? "held" : "queued", ...(held ? { detail: reasons.join("; ").slice(0, 300) } : {}) }],
          },
        },
        upsert: true,
      },
    }));
  });
  if (!writes.length) return 0;
  const result = await EsimFulfillment.bulkWrite(writes, { ordered: false });
  if (held && result.upsertedCount) {
    // Settlement must not wait on the notice.
    void import("@/lib/notifications/notifications")
      .then(({ notifyAdminsPaymentAnomaly }) =>
        notifyAdminsPaymentAnomaly({
          title: "eSIM order held for review",
          message: `Order ${order.orderNumber}: ${reasons.join("; ")}. Approve or reject it under eSIM → Problems.`,
          dedupeKey: `esim-review:${order._id}`,
        }),
      )
      .catch(console.error);
  }
  return result.upsertedCount;
}

/** Why this order should wait for a person (ORD-13); empty when the rules are off or it passes. */
async function holdReasons(order: { _id: mongoose.Types.ObjectId; total?: number; customerId?: unknown; guestEmail?: string | null }) {
  const risk = (await getEsimSettings()).risk;
  if (!risk || (!risk.reviewOverMinor && !risk.maxOrders)) return [];
  let recentOrders = 0;
  const buyer = order.guestEmail
    ? { guestEmail: order.guestEmail }
    : mongoose.isValidObjectId(order.customerId)
      ? { customerId: order.customerId }
      : null;
  if (risk.maxOrders && buyer) {
    const since = new Date(Date.now() - risk.windowHours * 3_600_000);
    const orderIds = await EsimFulfillment.distinct("order", { createdAt: { $gte: since }, order: { $ne: order._id } });
    recentOrders = orderIds.length ? await Order.countDocuments({ _id: { $in: orderIds }, ...buyer }) : 0;
  }
  return reviewReasons({ totalMinor: Math.round((order.total ?? 0) * 100), recentOrders }, risk);
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

/** The sale as it was when the eSIM was bought (ORD-04); written once per eSIM. */
async function saleSnapshot(
  job: IEsimFulfillment,
  plan: IEsimPlan,
  order: { currency?: string; total?: number; items?: Array<{ price: number; quantity: number }> } | null,
  charged: PurchaseResult["charged"],
): Promise<EsimSaleSnapshot> {
  const durationDays = plan.duration.configurable ? job.durationDays : null;
  // What the supplier says it charged, else its list price for what was bought.
  const costCurrency = (charged?.currency || plan.cost.currency).toUpperCase();
  const costMinor = charged ? charged.amountMinor : purchaseCostMinor(plan.cost, durationDays);
  const rate = (await currentRates([costCurrency])).get(costCurrency);
  const usdPerUnit = rate?.usdPerUnit ?? (costCurrency === plan.cost.currency.toUpperCase() ? plan.pricing?.usdPerUnit : null) ?? null;
  return {
    providerCode: plan.providerCode,
    providerPlanId: plan.providerPlanId,
    planName: plan.name,
    destination: plan.destination,
    scope: plan.coverage.scope,
    countries: plan.coverage.countries.map((country) => country.code),
    megabytes: plan.data.megabytes,
    dataType: plan.data.type,
    validityDays: durationDays ?? plan.validityDays,
    durationDays,
    sale: {
      currency: order?.currency || "USD",
      amountMinor: unitSaleMinor({ total: order?.total ?? 0, items: order?.items ?? [] }, job.lineIndex),
    },
    cost: { currency: costCurrency, amountMinor: costMinor, usdMinor: usdMinorOf(costMinor, usdPerUnit), usdPerUnit },
    takenAt: new Date(),
  };
}

async function recordEsim(job: IEsimFulfillment, plan: IEsimPlan, result: PurchaseResult, esim: ProviderEsim) {
  const order = await Order.findById(job.order)
    .select({ customerId: 1, guestEmail: 1, currency: 1, total: 1, "items.price": 1, "items.quantity": 1 })
    .lean<{
      customerId?: unknown;
      guestEmail?: string;
      currency?: string;
      total?: number;
      items?: Array<{ price: number; quantity: number }>;
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
  if (!profile!.snapshot) {
    const snapshot = await saleSnapshot(job, plan, order, result.charged);
    await EsimProfile.updateOne({ _id: profile!._id, snapshot: null }, { $set: { snapshot } });
    profile!.snapshot = snapshot;
  }
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

  // Not bought yet and the order was refunded or cancelled since (USR-08): never buy it now.
  if (job.state === "queued") {
    const order = await Order.findById(job.order).select({ paymentStatus: 1, status: 1 }).lean<{ paymentStatus?: string; status?: string } | null>();
    if (!order || order.paymentStatus === PAYMENT_STATUS.REFUNDED || order.status === ORDER_STATUS.CANCELLED) {
      await EsimFulfillment.updateOne(
        { _id: job._id, "lease.owner": owner },
        { $set: { state: "failed", lease: null, lastError: { code: "order_refunded", message: "The order was refunded", at: now }, refund: { state: "done", amount: 0, at: now, note: "order refunded in Storify" } } },
      );
      return "failed";
    }
  }

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
    // A start date goes only to a supplier that schedules; checkout offers one only when every candidate does.
    const activationDate = job.activationDate && supportsScheduledActivation(plan.providerCode) ? job.activationDate : null;
    try {
      const adapter = adapterFor(provider);
      result = await withProviderLog(
        {
          provider: provider._id as mongoose.Types.ObjectId,
          providerCode: provider.code,
          operation: pendingOrder ? "purchase.query" : "purchase",
          refs: { orderId: String(job.order), planId: String(plan._id) },
          request: pendingOrder
            ? { providerOrderId: pendingOrder, ...(activationDate ? { activationDate } : {}) }
            : { providerPlanId: plan.providerPlanId, durationDays, ...(activationDate ? { activationDate } : {}) },
        },
        () =>
          pendingOrder
            ? adapter.queryPurchase(pendingOrder, { activationDate })
            : adapter.purchase({
                providerPlanId: plan.providerPlanId,
                durationDays,
                activationDate,
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
  if (outcome.kind === "error" && plan && looksLikeBalanceProblem(outcome.message)) {
    await alertSupplierProblem(plan.providerCode, "balance", `Refused an eSIM for order ${job.orderNumber}: ${outcome.message}`);
  }

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

// ---------------------------------------------------------------------------
// Admin actions on a job (ADM-08). Each says why it refuses; the caller runs
// the order's fulfilment or settlement afterwards.
// ---------------------------------------------------------------------------

export class JobActionError extends Error {}

async function adminJob(jobId: string) {
  if (!mongoose.isValidObjectId(jobId)) throw new JobActionError("Unknown job");
  const job = await EsimFulfillment.findById(jobId);
  if (!job) throw new JobActionError("Unknown job");
  if (job.state === "fulfilled") throw new JobActionError("This eSIM was already issued");
  if (job.state === "review") throw new JobActionError("This order is held for review: approve or reject it first");
  if (job.refund && job.refund.state !== "manual") {
    throw new JobActionError("This eSIM was already refunded; place a new order instead");
  }
  return job;
}

/**
 * Tries the job again now — on its current supplier, or on another of its
 * candidates. Switching is refused while a supplier order may still complete
 * (pending, or an uncertain answer), so the shopper is never sold two eSIMs.
 * A refund waiting for a person is called off: the eSIM is being issued.
 */
export async function adminRetryJob(jobId: string, options: { candidateIndex?: number; actor?: string } = {}) {
  const job = await adminJob(jobId);
  const switching = options.candidateIndex !== undefined && options.candidateIndex !== job.candidateIndex;
  if (switching) {
    if (options.candidateIndex! < 0 || options.candidateIndex! >= job.candidates.length) throw new JobActionError("No such supplier for this eSIM");
    if (job.providerOrderId || job.state === "provider_pending" || job.lastError?.code === "uncertain") {
      throw new JobActionError("The current supplier may still deliver this eSIM; retry it there, or wait");
    }
  }
  const now = new Date();
  await EsimFulfillment.updateOne(
    { _id: job._id },
    {
      $set: {
        state: job.providerOrderId && !switching ? "provider_pending" : "queued",
        candidateIndex: switching ? options.candidateIndex : job.candidateIndex,
        candidateAttempts: 0,
        nextAttemptAt: now,
        lease: null,
        ...(switching ? { providerOrderId: null, pendingSince: null } : job.pendingSince ? { pendingSince: now } : {}),
      },
      $unset: { refund: "" },
      $push: { history: { at: now, event: switching ? "admin_switch" : "admin_retry", detail: options.actor } },
    },
  );
  return { orderId: String(job.order) };
}

/**
 * Stops trying and marks the job failed, so the order's settlement refunds
 * it (store credit, or a refund by hand for a guest).
 */
export async function adminFailJob(jobId: string, actor?: string) {
  const job = await adminJob(jobId);
  if (job.state === "failed") return { orderId: String(job.order) };
  const now = new Date();
  await EsimFulfillment.updateOne(
    { _id: job._id },
    {
      $set: { state: "failed", lease: null, lastError: { code: "admin", message: "Stopped by an admin", at: now } },
      $push: { history: { at: now, event: "admin_fail", detail: actor } },
    },
  );
  return { orderId: String(job.order) };
}

/**
 * A person's decision on an order held for review (ORD-13), for every held
 * eSIM of the job's order at once. Approved: they are bought now. Rejected:
 * nothing is bought, and the payment is to be refunded in Storify to where it
 * came from — never to store credit, as the order is suspected fraud — so the
 * jobs are marked for a refund by hand with each unit's share.
 */
export async function adminReviewOrder(jobId: string, decision: "approved" | "rejected", actor?: string) {
  if (!mongoose.isValidObjectId(jobId)) throw new JobActionError("Unknown job");
  const job = await EsimFulfillment.findById(jobId).select({ order: 1, state: 1 }).lean();
  if (!job) throw new JobActionError("Unknown job");
  if (job.state !== "review") throw new JobActionError("This order is not waiting for review");
  const now = new Date();
  const held = await EsimFulfillment.find({ order: job.order, state: "review" }).select({ lineIndex: 1 }).lean();
  const decided = { "review.decision": decision, "review.decidedAt": now, "review.decidedBy": actor ?? null };
  if (decision === "approved") {
    await EsimFulfillment.updateMany(
      { _id: { $in: held.map((entry) => entry._id) }, state: "review" },
      { $set: { state: "queued", nextAttemptAt: now, ...decided }, $push: { history: { at: now, event: "review_approved", detail: actor } } },
    );
    return { orderId: String(job.order), count: held.length };
  }
  const order = await Order.findById(job.order).select({ total: 1, "items.price": 1, "items.quantity": 1 }).lean<{ total?: number; items?: Array<{ price: number; quantity: number }> } | null>();
  for (const entry of held) {
    const share = unitSaleMinor({ total: order?.total ?? 0, items: order?.items ?? [] }, entry.lineIndex) / 100;
    await EsimFulfillment.updateOne(
      { _id: entry._id, state: "review" },
      {
        $set: {
          state: "failed",
          lease: null,
          lastError: { code: "review_rejected", message: "Rejected at review", at: now },
          refund: { state: "manual", amount: share, at: now, note: "Rejected at review: refund the payment in Storify (Orders → Refund)" },
          ...decided,
        },
        $push: { history: { at: now, event: "review_rejected", detail: actor } },
      },
    );
  }
  return { orderId: String(job.order), count: held.length };
}

/** A refund a person made outside the store (a guest's gateway refund), recorded on the job. */
export async function adminMarkRefunded(jobId: string, note: string, actor?: string) {
  if (!mongoose.isValidObjectId(jobId)) throw new JobActionError("Unknown job");
  const job = await EsimFulfillment.findById(jobId);
  if (!job || job.state !== "failed") throw new JobActionError("Only a failed eSIM can be marked refunded");
  if (job.refund?.state === "done") throw new JobActionError("Already refunded");
  const now = new Date();
  await EsimFulfillment.updateOne(
    { _id: job._id },
    {
      $set: { refund: { state: "done", amount: job.refund?.amount ?? 0, at: now, note: note.slice(0, 200) || "Refunded by hand" } },
      $push: { history: { at: now, event: "admin_refunded", detail: actor } },
    },
  );
  return { orderId: String(job.order) };
}

/**
 * Binds an eSIM obtained outside the automatic purchase (bought by hand on
 * the supplier's portal) to the job: reads it from the supplier by ICCID and
 * records it as if the purchase had returned it.
 */
export async function adminBindEsim(jobId: string, input: { candidateIndex: number; iccid: string; actor?: string }) {
  const job = await adminJob(jobId);
  const planId = job.candidates[input.candidateIndex];
  const plan = planId ? await EsimPlan.findById(planId) : null;
  if (!plan) throw new JobActionError("No such supplier for this eSIM");
  const provider = await EsimProvider.findOne({ code: plan.providerCode }).select("+secretCredentials");
  if (!provider) throw new JobActionError("Supplier is not set up");
  const iccid = input.iccid.replace(/\s+/g, "");
  if (!/^\d{18,22}F?$/i.test(iccid)) throw new JobActionError("That is not an ICCID");
  if (await EsimProfile.exists({ iccid })) throw new JobActionError("That eSIM is already bound to an order");
  const ref = { providerEsimId: null, simId: null, iccid };
  const esim = await withProviderLog(
    { provider: provider._id as mongoose.Types.ObjectId, providerCode: provider.code, operation: "esim.bind", refs: { orderId: String(job.order), planId: String(plan._id) }, request: { iccid } },
    () => adapterFor(provider).getEsim(ref),
    (value) => ({ status: value.status, iccid: value.iccid }),
  );
  if (esim.iccid && esim.iccid.replace(/F$/i, "") !== iccid.replace(/F$/i, "")) {
    throw new JobActionError("The supplier returned a different eSIM for that ICCID");
  }
  if (!esim.installation.activationCode && !esim.installation.smdpAddress) {
    throw new JobActionError("The supplier returned no installation details for that ICCID");
  }
  const result: PurchaseResult = { status: "fulfilled", providerOrderId: `manual:${iccid}`, charged: null, esim, raw: { manual: true } };
  const profile = await recordEsim(job, plan, result, { ...esim, iccid: esim.iccid ?? iccid });
  const now = new Date();
  await EsimFulfillment.updateOne(
    { _id: job._id },
    {
      $set: { state: "fulfilled", profile: profile._id, providerCode: plan.providerCode, providerOrderId: result.providerOrderId, candidateIndex: input.candidateIndex, lease: null, lastError: null },
      $unset: { refund: "" },
      $push: { history: { at: now, event: "admin_bind", detail: `${plan.providerCode} ${iccid}${input.actor ? ` by ${input.actor}` : ""}` } },
    },
  );
  return { orderId: String(job.order), profileId: String(profile._id) };
}
