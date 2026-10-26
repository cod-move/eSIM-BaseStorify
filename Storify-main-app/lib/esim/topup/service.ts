import "server-only";

import { randomUUID } from "node:crypto";
import { mongoose } from "@/lib/db";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimTopup, type IEsimTopup } from "@/models/esim-topup.model";
import { EsimTopupQuote } from "@/models/esim-topup-quote.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { decide, type Outcome } from "@/lib/esim/fulfillment/policy";
import { refreshEsimProfile } from "@/lib/esim/account/esims";
import { ProviderError, type TopupResult } from "@/lib/esim/providers/types";
import type { EsimLineAttributes } from "@/lib/esim/cart/line-attributes";
import { findTopupProduct } from "@/lib/esim/topup/product";
import { alertSupplierProblem, looksLikeBalanceProblem } from "@/lib/esim/alerts";

/**
 * Paid top-up lines → supplier top-ups (TOP-04/05).
 *
 * `enqueueOrderTopups` only writes jobs (it runs inside payment settlement,
 * patch P3, through `esimQueueOrder`); `processTopupJobs` calls the supplier,
 * right after payment and from the fulfilment cron.
 *
 * Retries follow the eSIM purchase policy (lib/esim/fulfillment/policy.ts)
 * with a single candidate: a refusal fails the top-up at once, an uncertain
 * answer is retried with the same key, "processing" is polled. A completed
 * top-up adds to the base package (stack) or adds a package of its own
 * (addon), then the eSIM is read again from the supplier for the real totals.
 */

const LEASE_MS = 5 * 60_000;
type Line = { variantId?: unknown; price?: number; quantity?: number; lineAttributes?: unknown };

/** The idempotency key every attempt of a top-up uses (the spec's `provider-topup:{id}`). */
export function topupIdempotencyKey(topupId: string): string {
  return `provider-topup:${topupId}`;
}

/**
 * One job per top-up line of a paid order. Idempotent through the unique
 * (order, line) index. A line whose quote is gone, belongs to another
 * account or was not charged becomes a failed job straight away, so a person
 * sees it and the money goes back.
 */
export async function enqueueOrderTopups(orderId: unknown): Promise<number> {
  const product = await findTopupProduct();
  if (!product) return 0;
  const order = await Order.findById(orderId)
    .select({ orderNumber: 1, paymentStatus: 1, status: 1, items: 1, customerId: 1, guestEmail: 1 })
    .lean<{
      _id: mongoose.Types.ObjectId;
      orderNumber: string;
      paymentStatus: string;
      status: string;
      items: Line[];
      customerId?: unknown;
      guestEmail?: string | null;
    } | null>();
  if (!order || order.paymentStatus !== PAYMENT_STATUS.PAID || order.status === ORDER_STATUS.CANCELLED) return 0;
  const lines = order.items
    .map((item, lineIndex) => ({ item, lineIndex }))
    .filter(({ item }) => String(item.variantId ?? "") === product.variantId);
  if (!lines.length) return 0;

  const now = new Date();
  const customer = !order.guestEmail && mongoose.isValidObjectId(order.customerId) ? String(order.customerId) : null;
  let added = 0;
  for (const { item, lineIndex } of lines) {
    const attributes = (item.lineAttributes && typeof item.lineAttributes === "object" ? item.lineAttributes : {}) as EsimLineAttributes;
    const quote = attributes.topup && mongoose.isValidObjectId(attributes.topup) ? await EsimTopupQuote.findById(attributes.topup).lean() : null;
    const priceMinor = Math.round(Number(item.price || 0) * 100);
    const problem = !quote
      ? "The top-up quote no longer exists"
      : !customer || String(quote.customer) !== customer
        ? "The order was not placed by the eSIM's owner"
        : !(priceMinor > 0)
          ? "The line was not charged"
          : null;
    const fields = {
      order: order._id,
      orderNumber: order.orderNumber,
      lineIndex,
      quote: quote?._id ?? new mongoose.Types.ObjectId(),
      customer: customer ? new mongoose.Types.ObjectId(customer) : null,
      esim: quote?.esim ?? null,
      iccid: quote?.iccid ?? attributes.iccid ?? null,
      plan: quote?.plan ?? null,
      providerCode: quote?.providerCode ?? "",
      topupPlanId: quote?.topupPlanId ?? "",
      name: quote?.name ?? attributes.label ?? "Top-up",
      megabytes: quote?.megabytes ?? 0,
      validityDays: quote?.validityDays ?? 0,
      mode: quote?.mode ?? "stack",
      priceMinor,
      cost: quote?.cost ?? { currency: "USD", amountMinor: 0 },
      nextAttemptAt: now,
      ...(problem
        ? {
            state: "failed" as const,
            lastError: { code: "invalid", message: problem, at: now },
            history: [{ at: now, event: "failed", detail: problem }],
            // Nothing was charged: nothing to give back.
            ...(priceMinor > 0 ? {} : { refund: { state: "done" as const, amount: 0, at: now, note: "not charged" } }),
          }
        : { state: "queued" as const, history: [{ at: now, event: "queued" }] }),
    };
    const result = await EsimTopup.updateOne({ order: order._id, lineIndex }, { $setOnInsert: fields }, { upsert: true });
    added += result.upsertedCount;
  }
  return added;
}

async function claim(filter: Record<string, unknown>, owner: string) {
  const now = new Date();
  return EsimTopup.findOneAndUpdate(
    {
      ...filter,
      state: { $in: ["queued", "processing"] },
      nextAttemptAt: { $lte: now },
      $or: [{ lease: null }, { "lease.until": { $lt: now } }],
    },
    { $set: { lease: { owner, until: new Date(now.getTime() + LEASE_MS) } } },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } },
  );
}

function outcomeOf(result: TopupResult): Outcome {
  if (result.status === "completed") return { kind: "fulfilled" };
  if (result.status === "failed") return { kind: "error", code: "rejected", message: "Supplier reports the top-up failed" };
  return { kind: "processing", providerOrderId: result.providerTopupId };
}

/** The packages a completed top-up adds; runs once, on the transition to completed. */
async function applyTopup(job: IEsimTopup) {
  if (!job.esim) return;
  const bytes = job.megabytes > 0 ? job.megabytes * 1024 * 1024 : null;
  if (job.mode === "addon") {
    await EsimPackage.updateOne(
      { esim: job.esim, topup: job._id },
      {
        $setOnInsert: {
          esim: job.esim,
          plan: job.plan,
          topup: job._id,
          kind: "addon",
          dataTotalBytes: bytes,
          dataRemainingBytes: bytes,
          validityDays: job.validityDays,
          status: "new",
        },
      },
      { upsert: true },
    );
  } else if (bytes) {
    // Stack: the base package grows; the refresh below replaces this with the supplier's figures.
    await EsimPackage.updateOne(
      { esim: job.esim, kind: "base", dataTotalBytes: { $ne: null } },
      { $inc: { dataTotalBytes: bytes, dataRemainingBytes: bytes }, $set: { status: "active" } },
    );
  }
  const profile = await EsimProfile.findById(job.esim);
  if (profile) {
    // Bypasses the shopper's once-a-minute limit: the eSIM just changed.
    await refreshEsimProfile(profile).catch((error) => console.error("eSIM refresh after a top-up failed:", error));
  }
}

async function processOne(job: IEsimTopup, owner: string): Promise<IEsimTopup["state"]> {
  const profile = job.esim ? await EsimProfile.findById(job.esim).select({ providerEsimId: 1, simId: 1, iccid: 1, providerCode: 1, order: 1 }).lean() : null;
  const provider = profile ? await EsimProvider.findOne({ code: job.providerCode }).select("+secretCredentials") : null;
  const now = new Date();

  let outcome: Outcome;
  let result: TopupResult | null = null;
  if (!profile || !provider) {
    outcome = { kind: "error", code: "not_found", message: "The eSIM or its supplier no longer exists" };
  } else {
    await EsimTopup.updateOne({ _id: job._id, "lease.owner": owner }, { $set: { state: "processing" }, $inc: { attempts: 1 } });
    const ref = { providerEsimId: profile.providerEsimId, simId: profile.simId, iccid: profile.iccid };
    const key = topupIdempotencyKey(String(job._id));
    try {
      const adapter = adapterFor(provider);
      const query = job.providerTopupId && adapter.queryTopup ? job.providerTopupId : null;
      result = await withProviderLog(
        {
          provider: provider._id as mongoose.Types.ObjectId,
          providerCode: provider.code,
          operation: query ? "topup.query" : "topup",
          refs: { orderId: String(job.order), esimId: String(job.esim), topupId: String(job._id) },
          request: query ? { providerTopupId: query } : { topupPlanId: job.topupPlanId },
        },
        // Without a query call, "is it done?" is asked by repeating the top-up with the same key.
        () => (query ? adapter.queryTopup!(query) : adapter.topup({ esim: ref, topupPlanId: job.topupPlanId, idempotencyKey: key })),
        (value) => ({ status: value.status, providerTopupId: value.providerTopupId }),
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
    { candidateIndex: 0, candidateCount: 1, candidateAttempts: job.candidateAttempts, pendingSince: job.pendingSince },
    outcome,
    now,
  );
  const event = (name: string, detail?: string) => ({ history: { at: now, event: name, ...(detail ? { detail } : {}) } });
  const error = outcome.kind === "error" ? { code: outcome.code, message: outcome.message, at: now } : null;
  if (outcome.kind === "error" && provider && looksLikeBalanceProblem(outcome.message)) {
    await alertSupplierProblem(job.providerCode, "balance", `Refused a top-up for order ${job.orderNumber}: ${outcome.message}`);
  }

  switch (decision.action) {
    case "fulfilled": {
      const moved = await EsimTopup.updateOne(
        { _id: job._id, state: { $ne: "completed" } },
        {
          $set: { state: "completed", providerTopupId: result?.providerTopupId ?? job.providerTopupId, completedAt: now, lease: null, lastError: null },
          $push: event("completed", job.providerCode),
        },
      );
      if (moved.modifiedCount) await applyTopup(job);
      return "completed";
    }
    case "poll":
      await EsimTopup.updateOne(
        { _id: job._id },
        {
          $set: { state: "processing", providerTopupId: decision.providerOrderId, pendingSince: decision.pendingSince, nextAttemptAt: decision.at, lease: null },
          ...(job.pendingSince ? {} : { $push: event("provider_pending", decision.providerOrderId) }),
        },
      );
      return "processing";
    case "retry":
      await EsimTopup.updateOne(
        { _id: job._id },
        {
          $set: { state: job.providerTopupId ? "processing" : "queued", nextAttemptAt: decision.at, lease: null, lastError: error },
          $inc: { candidateAttempts: 1 },
          $push: event("retry", decision.reason),
        },
      );
      return "queued";
    case "failover":
    case "fail": {
      const reason = decision.reason;
      await EsimTopup.updateOne(
        { _id: job._id },
        { $set: { state: "failed", lease: null, lastError: error ?? { code: "failed", message: reason, at: now } }, $push: event("failed", reason) },
      );
      return "failed";
    }
  }
}

export interface TopupProcessResult {
  processed: number;
  completed: number;
  failed: number;
  orders: string[];
}

export async function processTopupJobs(
  options: { orderId?: unknown; limit?: number; budgetMs?: number } = {},
): Promise<TopupProcessResult> {
  const owner = randomUUID();
  const deadline = Date.now() + (options.budgetMs ?? 50_000);
  const filter = options.orderId ? { order: options.orderId } : {};
  const result: TopupProcessResult = { processed: 0, completed: 0, failed: 0, orders: [] };
  const touched = new Set<string>();
  while (result.processed < (options.limit ?? 50) && Date.now() < deadline) {
    const job = await claim(filter, owner);
    if (!job) break;
    result.processed += 1;
    touched.add(String(job.order));
    const state = await processOne(job, owner);
    if (state === "completed") result.completed += 1;
    if (state === "failed") result.failed += 1;
  }
  result.orders = [...touched];
  return result;
}

// ---------------------------------------------------------------------------
// Admin actions (ADM-08 for top-ups). The caller runs the order's top-ups or
// settlement afterwards.
// ---------------------------------------------------------------------------

export class TopupActionError extends Error {}

async function adminTopup(topupId: string) {
  if (!mongoose.isValidObjectId(topupId)) throw new TopupActionError("Unknown top-up");
  const job = await EsimTopup.findById(topupId);
  if (!job) throw new TopupActionError("Unknown top-up");
  if (job.state === "completed") throw new TopupActionError("This top-up was already completed");
  return job;
}

/**
 * Tries again now, with the same key — so a top-up the supplier did in fact
 * make is never made twice. Refused for a job that was refunded, or that
 * never had what a top-up needs (its quote, the owner's order).
 */
export async function adminRetryTopup(topupId: string, actor?: string) {
  const job = await adminTopup(topupId);
  if (job.refund && job.refund.state !== "manual") throw new TopupActionError("This top-up was already refunded; the shopper can buy it again");
  if (job.lastError?.code === "invalid") throw new TopupActionError(`This top-up cannot be made: ${job.lastError.message}`);
  const now = new Date();
  await EsimTopup.updateOne(
    { _id: job._id },
    {
      $set: { state: job.providerTopupId ? "processing" : "queued", candidateAttempts: 0, nextAttemptAt: now, lease: null, ...(job.pendingSince ? { pendingSince: now } : {}) },
      $unset: { refund: "" },
      $push: { history: { at: now, event: "admin_retry", detail: actor } },
    },
  );
  return { orderId: String(job.order) };
}

/** Stops trying; the order's settlement refunds it. */
export async function adminFailTopup(topupId: string, actor?: string) {
  const job = await adminTopup(topupId);
  if (job.state === "failed") return { orderId: String(job.order) };
  const now = new Date();
  await EsimTopup.updateOne(
    { _id: job._id },
    {
      $set: { state: "failed", lease: null, lastError: { code: "admin", message: "Stopped by an admin", at: now } },
      $push: { history: { at: now, event: "admin_fail", detail: actor } },
    },
  );
  return { orderId: String(job.order) };
}

/** A refund a person made outside the store, recorded on the top-up. */
export async function adminMarkTopupRefunded(topupId: string, note: string, actor?: string) {
  if (!mongoose.isValidObjectId(topupId)) throw new TopupActionError("Unknown top-up");
  const job = await EsimTopup.findById(topupId);
  if (!job || job.state !== "failed") throw new TopupActionError("Only a failed top-up can be marked refunded");
  if (job.refund?.state === "done") throw new TopupActionError("Already refunded");
  const now = new Date();
  await EsimTopup.updateOne(
    { _id: job._id },
    {
      $set: { refund: { state: "done", amount: job.refund?.amount ?? 0, at: now, note: note.slice(0, 200) || "Refunded by hand" } },
      $push: { history: { at: now, event: "admin_refunded", detail: actor } },
    },
  );
  return { orderId: String(job.order) };
}
