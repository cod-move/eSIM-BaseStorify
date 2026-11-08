import "server-only";

import { randomUUID } from "node:crypto";
import { mongoose } from "@/lib/db";
import { EsimNumberOp, type IEsimNumberOp, type NumberOpTransfer } from "@/models/esim-number-op.model";
import { EsimNumberOrder, type IEsimNumberOrder } from "@/models/esim-number-order.model";
import { EsimNumberSequence } from "@/models/esim-number-sequence.model";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { TopConnectOrderIdError, type TopConnectClient } from "@/lib/esim/providers/topconnect";
import { ProviderError } from "@/lib/esim/providers/types";
import { afterActivation, afterTransfer, type TransferAnswer } from "@/lib/esim/numbers/op-policy";

/**
 * Carrying out recharges and data packages on number cards (NUM-05/08/09).
 *
 * One runner at a time holds the TopConnect lock (`EsimNumberSequence`), so
 * order ids are handed out in turn; each operation keeps its id before the
 * transfer is sent and resends the same id, so money never moves twice (see
 * op-policy.ts). A package is paid by moving its price onto the card first,
 * then switched on; refused → the price is moved back. An answer nobody can
 * settle stops the operation for a person (`manual`) and tells the admins.
 */

const SEQUENCE = "topconnect";
const LEASE_MS = 90_000;
const WAIT_MS = 2 * 60_000;

type Client = TopConnectClient;
export type TopConnectContext = { client: Client; providerId: mongoose.Types.ObjectId };
type Context = TopConnectContext;

/**
 * One movement of money onto a card (or off it, negative), kept in a field
 * of a stored record: an operation's `transfer`, a card-to-card move's
 * `debit` (lib/esim/numbers/card-tools.ts).
 */
export interface MoneyLeg {
  doc: mongoose.Document & { _id: unknown; createdAt: Date };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record's own model, any of them
  model: mongoose.Model<any>;
  field: string;
  msisdn: string;
  currency: string;
  /** For the supplier log. */
  ref: string;
}

const opLeg = (op: IEsimNumberOp, field: "transfer" | "rollback"): MoneyLeg => ({ doc: op, model: EsimNumberOp, field, msisdn: op.msisdn, currency: op.currency, ref: String(op.order) });

// ── queueing ─────────────────────────────────────────────────────────────

/** The first recharge and package bought with a number, once it is the buyer's (from the job's snapshot). */
export async function enqueueFirstOps(job: Pick<IEsimNumberOrder, "order" | "orderNumber" | "lineIndex" | "customer" | "number" | "msisdn" | "line">) {
  const line = job.line;
  if (!line || !job.number) return 0;
  const base = {
    source: "first" as const,
    number: job.number,
    msisdn: job.msisdn,
    customer: job.customer,
    order: job.order,
    orderNumber: job.orderNumber,
    lineIndex: job.lineIndex,
  };
  const ops = [
    line.recharge ? { ...base, kind: "recharge" as const, amountMinor: line.recharge, currency: line.rechargeCurrency, packet: null, priceMinor: line.rechargeUsdMinor } : null,
    line.packetId && line.packetCost
      ? {
          ...base,
          kind: "packet" as const,
          amountMinor: line.packetCost.amountMinor,
          currency: line.packetCost.currency,
          packet: { id: line.packet ?? null, packetId: line.packetId, name: line.packetName ?? line.packetId },
          priceMinor: line.packetUsdMinor,
        }
      : null,
  ].filter((op): op is NonNullable<typeof op> => op !== null);
  return enqueue(ops);
}

export type QueuedOp = Pick<IEsimNumberOp, "kind" | "source" | "number" | "msisdn" | "customer" | "order" | "orderNumber" | "lineIndex" | "amountMinor" | "currency" | "packet" | "priceMinor">;

/** Idempotent through the unique (order, line, kind) index. */
export async function enqueue(ops: QueuedOp[]): Promise<number> {
  const now = new Date();
  let added = 0;
  for (const op of ops) {
    const fields = op.amountMinor > 0
      ? { ...op, state: "queued" as const, nextAttemptAt: now, history: [{ at: now, event: "queued" }] }
      : { ...op, state: "failed" as const, nextAttemptAt: now, lastError: { code: "invalid", message: "Nothing to move onto the card", at: now }, history: [{ at: now, event: "failed" }] };
    const result = await EsimNumberOp.updateOne({ order: op.order, lineIndex: op.lineIndex, kind: op.kind }, { $setOnInsert: fields }, { upsert: true });
    added += result.upsertedCount;
  }
  return added;
}

// ── the lock and the order ids ───────────────────────────────────────────

async function takeLock(owner: string): Promise<boolean> {
  const now = new Date();
  await EsimNumberSequence.updateOne({ _id: SEQUENCE }, { $setOnInsert: { last: null, lease: null } }, { upsert: true });
  const taken = await EsimNumberSequence.findOneAndUpdate(
    { _id: SEQUENCE, $or: [{ lease: null }, { "lease.until": { $lt: now } }] },
    { $set: { lease: { owner, until: new Date(now.getTime() + LEASE_MS) } } },
    { returnDocument: "after" },
  ).lean();
  return Boolean(taken);
}

async function releaseLock(owner: string) {
  await EsimNumberSequence.updateOne({ _id: SEQUENCE, "lease.owner": owner }, { $set: { lease: null } });
}

/** The next id to send: one past the last the store knows of, asking the account when it knows none. */
async function nextOrderId(context: Context): Promise<number> {
  const sequence = await EsimNumberSequence.findById(SEQUENCE).lean();
  if (typeof sequence?.last === "number") return sequence.last + 1;
  const account = await logged(context, "numbers.account", {}, () => context.client.account());
  await EsimNumberSequence.updateOne({ _id: SEQUENCE }, { $set: { last: account.lastOrderId } });
  return account.lastOrderId + 1;
}

async function noteLast(last: number) {
  await EsimNumberSequence.updateOne({ _id: SEQUENCE, $or: [{ last: null }, { last: { $lt: last } }] }, { $set: { last } });
}

function logged<T>(context: Context, operation: string, request: unknown, call: () => Promise<T>, refs?: { orderId?: string }) {
  return withProviderLog({ provider: context.providerId, providerCode: "topconnect", operation, request, refs }, call);
}

// ── one transfer, settled ────────────────────────────────────────────────

/** Whether the card's log shows our id for our amount; null when it cannot be read. */
async function ourTransferLogged(context: Context, leg: MoneyLeg, orderId: number, amountMinor: number): Promise<boolean | null> {
  try {
    const from = new Date(leg.doc.createdAt.getTime() - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const records = await logged(context, "numbers.transfer-log", { msisdn: leg.msisdn, from, to }, () => context.client.transferLog(leg.msisdn, from, to));
    return records.some((record) => record.orderId === orderId && record.side !== "client" && record.amountMinor === amountMinor);
  } catch {
    return null;
  }
}

export type MoveResult = { result: "done" | "wait" | "refused" | "manual"; message?: string };

/**
 * Moves `amountMinor` onto the leg's card (or off it, negative), persisting
 * the id and the send count before each send. Call under the TopConnect lock.
 */
export async function moveMoney(context: Context, leg: MoneyLeg, amountMinor: number): Promise<MoveResult> {
  const { doc, model, field } = leg;
  for (let round = 0; round < 3; round += 1) {
    // Plain fields: spreading a Mongoose sub-document would write its internals, not these.
    const stored = doc.get(field) as NumberOpTransfer | null;
    const current: NumberOpTransfer = { orderId: stored?.orderId ?? null, tries: stored?.tries ?? 0, done: Boolean(stored?.done), at: stored?.at ?? null };
    const orderId = current.orderId ?? (await nextOrderId(context));
    const tries = current.orderId === orderId ? current.tries : 0;
    // Counted before the send: a crash after sending still reads as "sent before".
    const sending = { orderId, tries: tries + 1, done: false, at: null };
    await model.updateOne({ _id: doc._id }, { $set: { [field]: sending } });
    doc.set(field, sending);

    let answer: TransferAnswer;
    try {
      await logged(context, "numbers.transfer", { msisdn: leg.msisdn, amountMinor, currency: leg.currency, orderId }, () =>
        context.client.transfer({ msisdn: leg.msisdn, amountMinor, currency: leg.currency, orderId }), { orderId: leg.ref });
      answer = { kind: "ok" };
    } catch (error) {
      answer = error instanceof TopConnectOrderIdError
        ? { kind: "clash", expected: error.expected }
        : error instanceof ProviderError && (error.code === "uncertain" || error.code === "invalid_response")
          ? { kind: "uncertain", message: error.message }
          : { kind: "refused", message: error instanceof Error ? error.message : String(error) };
    }
    let step = afterTransfer({ orderId, tries }, answer);
    if (step.do === "check_log") step = afterTransfer({ orderId, tries }, answer, await ourTransferLogged(context, leg, orderId, amountMinor));

    switch (step.do) {
      case "done": {
        await noteLast(step.last);
        const done = { orderId, tries: tries + 1, done: true, at: new Date() };
        await model.updateOne({ _id: doc._id }, { $set: { [field]: done }, $push: { history: { at: new Date(), event: `${field} done`, detail: `order id ${orderId}` } } });
        doc.set(field, done);
        return { result: "done" };
      }
      case "resend":
        await noteLast(step.orderId - 1);
        await model.updateOne({ _id: doc._id }, { $set: { [field]: { orderId: step.orderId, tries: 0, done: false, at: null } } });
        doc.set(field, { orderId: step.orderId, tries: 0, done: false, at: null });
        continue;
      case "wait":
        return { result: "wait", message: answer.kind === "uncertain" ? answer.message : undefined };
      case "refused":
        return { result: "refused", message: step.message };
      case "manual":
        return { result: "manual", message: step.reason };
      case "check_log":
        return { result: "manual", message: "The transfer log could not settle the order id" };
    }
  }
  return { result: "manual", message: "TopConnect kept refusing the order ids" };
}

// ── one operation ────────────────────────────────────────────────────────

async function finish(op: IEsimNumberOp, state: "completed" | "failed" | "manual", detail: string, code: string = state) {
  const now = new Date();
  await EsimNumberOp.updateOne(
    { _id: op._id },
    {
      $set: {
        state,
        ...(state === "completed" ? { completedAt: now, lastError: null } : { lastError: { code, message: detail.slice(0, 500), at: now } }),
        // A person settles a manual one; it is never refunded automatically.
        ...(state === "manual" ? { refund: { state: "manual", amount: 0, at: now, note: detail.slice(0, 300) } } : {}),
      },
      $push: { history: { at: now, event: state, detail: detail.slice(0, 300) } },
    },
  );
  if (op.source === "first") {
    await EsimNumberOrder.updateOne({ order: op.order, lineIndex: op.lineIndex }, { $set: { [op.kind]: state === "completed" ? "done" : "failed" } });
  }
  if (state === "manual") {
    const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");
    await notifyAdminsPaymentAnomaly({
      title: "Number card: check TopConnect by hand",
      message: `Order ${op.orderNumber}, +${op.msisdn}: ${op.kind === "packet" ? `package ${op.packet?.name ?? ""}` : "recharge"} ${(op.amountMinor / 100).toFixed(2)} ${op.currency} — ${detail}`.slice(0, 500),
      dedupeKey: `esim-number-op-manual:${op._id}`,
    }).catch(console.error);
  }
}

async function wait(op: IEsimNumberOp, detail?: string) {
  await EsimNumberOp.updateOne(
    { _id: op._id },
    {
      $set: { state: "processing", nextAttemptAt: new Date(Date.now() + WAIT_MS), ...(detail ? { lastError: { code: "uncertain", message: detail.slice(0, 500), at: new Date() } } : {}) },
      $push: { history: { at: new Date(), event: "waiting", detail: detail?.slice(0, 300) } },
    },
  );
}

async function rollBack(context: Context, op: IEsimNumberOp, reason: string) {
  const moved = await moveMoney(context, opLeg(op, "rollback"), -op.amountMinor);
  if (moved.result === "done") return finish(op, "failed", `Package refused (${reason}); its price was moved back`, "rejected");
  if (moved.result === "wait") return wait(op, `Moving the package price back: ${moved.message ?? "no answer"}`);
  return finish(op, "manual", `Package refused (${reason}), and moving its price back failed (${moved.message ?? moved.result}): the money is on the card`);
}

async function processOne(context: Context, op: IEsimNumberOp) {
  await EsimNumberOp.updateOne({ _id: op._id }, { $set: { state: "processing" } });
  // A package being moved back finishes that first.
  if (op.rollback && !op.rollback.done) return rollBack(context, op, op.lastError?.message ?? "refused");

  if (!op.transfer?.done) {
    const moved = await moveMoney(context, opLeg(op, "transfer"), op.amountMinor);
    if (moved.result === "wait") return wait(op, moved.message);
    if (moved.result === "refused") return finish(op, "failed", `TopConnect refused the transfer: ${moved.message ?? ""}`, "rejected");
    if (moved.result === "manual") return finish(op, "manual", moved.message ?? "Transfer not settled");
  }
  if (op.kind === "recharge") return finish(op, "completed", `${(op.amountMinor / 100).toFixed(2)} ${op.currency} on the card`);

  const packetId = op.packet?.packetId ?? "";
  const tries = op.activation?.tries ?? 0;
  await EsimNumberOp.updateOne({ _id: op._id }, { $set: { "activation.tries": tries + 1 } });
  let decision: ReturnType<typeof afterActivation>;
  try {
    await logged(context, "numbers.activate", { msisdn: op.msisdn, packetId }, () => context.client.activateDataPackage(op.msisdn, packetId), { orderId: String(op.order) });
    decision = afterActivation(tries, { kind: "ok" });
  } catch (error) {
    if (error instanceof ProviderError && (error.code === "uncertain" || error.code === "invalid_response")) {
      const listed = await context.client.activePackages(op.msisdn).then((packages) => packages.some((entry) => entry.packetId === packetId)).catch(() => false);
      decision = afterActivation(tries, { kind: "uncertain", listed });
    } else {
      decision = afterActivation(tries, { kind: "refused", message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (decision.do === "done") {
    await EsimNumberOp.updateOne({ _id: op._id }, { $set: { activation: { tries: tries + 1, done: true, at: new Date() } } });
    return finish(op, "completed", `${op.packet?.name ?? packetId} switched on`);
  }
  if (decision.do === "wait") return wait(op, "Package not confirmed yet");
  await EsimNumberOp.updateOne({ _id: op._id }, { $set: { lastError: { code: "rejected", message: decision.reason.slice(0, 500), at: new Date() } } });
  op.set("lastError", { code: "rejected", message: decision.reason, at: new Date() });
  return rollBack(context, op, decision.reason);
}

/**
 * Carries out due operations — of one order (settlement) or any (the cron)
 * — one at a time under the TopConnect lock. Skips the run when another
 * holds the lock or TopConnect is not set up (operations wait).
 */
export async function processNumberOps(options: { orderId?: string; limit?: number; budgetMs?: number } = {}) {
  const result = { completed: 0, failed: 0, manual: 0, waiting: 0, orders: [] as string[] };
  const filter: Record<string, unknown> = { state: { $in: ["queued", "processing"] }, nextAttemptAt: { $lte: new Date() } };
  if (options.orderId) filter.order = new mongoose.Types.ObjectId(options.orderId);
  if (!(await EsimNumberOp.exists(filter))) return result;
  const started = Date.now();
  const orders = new Set<string>();
  await underTopConnectLock(async (context, renew) => {
    const ops = await EsimNumberOp.find(filter).sort({ nextAttemptAt: 1, createdAt: 1 }).limit(options.limit ?? 50);
    for (const op of ops) {
      if (Date.now() - started > (options.budgetMs ?? 20_000)) break;
      await renew();
      try {
        await processOne(context, op);
      } catch (error) {
        // Unexpected (a database hiccup): try again later; the ids kept make that safe.
        await wait(op, error instanceof Error ? error.message : String(error));
      }
      orders.add(String(op.order));
      const state = (await EsimNumberOp.findById(op._id).select({ state: 1 }).lean())?.state;
      if (state === "completed") result.completed += 1;
      else if (state === "failed") result.failed += 1;
      else if (state === "manual") result.manual += 1;
      else result.waiting += 1;
    }
  });
  result.orders = [...orders];
  return result;
}

/**
 * Runs `run` holding the TopConnect lock, so order ids go out one at a time;
 * `renew` keeps the lock between steps. Null when another holds the lock or
 * TopConnect is not set up.
 */
export async function underTopConnectLock<T>(run: (context: Context, renew: () => Promise<void>) => Promise<T>): Promise<T | null> {
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") return null;
  const owner = randomUUID();
  if (!(await takeLock(owner))) return null;
  try {
    const context: Context = { client: topConnectClient(credentialsOf(provider)), providerId: provider._id as mongoose.Types.ObjectId };
    const renew = async () => {
      await EsimNumberSequence.updateOne({ _id: SEQUENCE, "lease.owner": owner }, { $set: { "lease.until": new Date(Date.now() + LEASE_MS) } });
    };
    return await run(context, renew);
  } finally {
    await releaseLock(owner);
  }
}
