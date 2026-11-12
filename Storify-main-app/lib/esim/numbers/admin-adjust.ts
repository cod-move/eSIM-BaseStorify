import "server-only";

import { mongoose } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberAdjustment, type IEsimNumberAdjustment } from "@/models/esim-number-adjustment.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { formatAmount } from "@/lib/esim/numbers/line";
import { refreshNumberCard } from "@/lib/esim/numbers/account";
import { moveMoney, underTopConnectLock, type MoneyLeg, type TopConnectContext } from "@/lib/esim/numbers/ops";
import { cardAdjustmentProblem, signedTransferMinor, type AdjustDirection } from "@/lib/esim/numbers/adjust-policy";

/**
 * An admin adds credit to a number card or takes some off (Admin → eSIM →
 * Numbers → Card credit). The card's balance is read from TopConnect first
 * (a deduction never takes it below zero), the adjustment is saved with the
 * admin's key, then TopConnect's `sbalance` moves the money under the
 * TopConnect lock with a kept order id (lib/esim/numbers/ops.ts `moveMoney`),
 * and the card is read again. An answer that cannot be settled waits for
 * the fulfilment cron, which resends the same order id.
 */

const WAIT_MS = 2 * 60_000;

export interface AdjustCardInput {
  numberId: string;
  direction: AdjustDirection;
  amountMinor: number;
  reason: string;
  key: string;
  admin: { id: string; email: string | null };
}

export type AdjustCardResult =
  | { ok: true; created: boolean; adjustment: AdminCardAdjustment; balanceMinor: number | null; currency: string }
  | { ok: false; message: string };

export interface AdminCardAdjustment {
  id: string;
  direction: AdjustDirection;
  amountMinor: number;
  currency: string;
  reason: string;
  admin: string | null;
  state: IEsimNumberAdjustment["state"];
  message: string | null;
  balanceBeforeMinor: number | null;
  balanceAfterMinor: number | null;
  createdAt: string;
}

const view = (row: Pick<IEsimNumberAdjustment, "_id" | "direction" | "amountMinor" | "currency" | "reason" | "admin" | "state" | "lastError" | "balanceBeforeMinor" | "balanceAfterMinor" | "createdAt">): AdminCardAdjustment => ({
  id: String(row._id),
  direction: row.direction,
  amountMinor: row.amountMinor,
  currency: row.currency,
  reason: row.reason,
  admin: row.admin?.email ?? null,
  state: row.state,
  message: row.state === "completed" ? null : (row.lastError?.message ?? null),
  balanceBeforeMinor: row.balanceBeforeMinor ?? null,
  balanceAfterMinor: row.balanceAfterMinor ?? null,
  createdAt: new Date(row.createdAt).toISOString(),
});

/** Reads the card from TopConnect now (not the cached copy), then what is stored. */
async function freshCard(numberId: string) {
  await EsimNumber.updateOne({ _id: numberId, card: { $ne: null } }, { $set: { "card.checkedAt": new Date(0) } });
  await refreshNumberCard(numberId, { force: true });
  return EsimNumber.findById(numberId).select({ msisdn: 1, dialCode: 1, nationalNumber: 1, card: 1 }).lean();
}

/** A card's balance and its latest adjustments, for the dialog. Null when the number is unknown. */
export async function cardCreditView(numberId: string, options: { refresh?: boolean } = {}) {
  if (!mongoose.isValidObjectId(numberId)) return null;
  const row = options.refresh
    ? await freshCard(numberId)
    : await EsimNumber.findById(numberId).select({ msisdn: 1, dialCode: 1, nationalNumber: 1, card: 1 }).lean();
  if (!row) return null;
  const [adjustments, provider] = await Promise.all([
    EsimNumberAdjustment.find({ number: row._id }).sort({ createdAt: -1 }).limit(20).lean<IEsimNumberAdjustment[]>(),
    EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean(),
  ]);
  return {
    msisdn: row.msisdn,
    title: `+${row.dialCode} ${row.nationalNumber}`,
    balanceMinor: row.card?.balanceMinor ?? null,
    currency: (row.card?.currency ?? provider?.settlementCurrency ?? "EUR").toUpperCase(),
    blocked: row.card?.blocked ?? null,
    checkedAt: row.card?.checkedAt ? new Date(row.card.checkedAt).toISOString() : null,
    adjustments: adjustments.map(view),
  };
}

export async function adjustCardCredit(input: AdjustCardInput): Promise<AdjustCardResult | null> {
  if (!mongoose.isValidObjectId(input.numberId)) return null;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, message: "Say why the card's credit changes" };

  const earlier = await EsimNumberAdjustment.findOne({ key: input.key }).lean<IEsimNumberAdjustment | null>();
  if (earlier) return reported(earlier, false);
  if (!(await EsimNumber.exists({ _id: input.numberId }))) return null;
  if (await EsimNumberAdjustment.exists({ number: input.numberId, state: { $in: ["queued", "processing"] } })) {
    return { ok: false, message: "A change to this card's credit is still being made; try again in a few minutes" };
  }

  // The balance as TopConnect has it now.
  const card = await freshCard(input.numberId);
  if (!card) return null;
  const balanceMinor = card.card?.balanceMinor ?? null;
  const problem = cardAdjustmentProblem({ direction: input.direction, amountMinor: input.amountMinor, balanceMinor, blocked: card.card?.blocked });
  if (problem) return { ok: false, message: problem };
  const provider = await EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean();
  const currency = (card.card?.currency ?? provider?.settlementCurrency ?? "EUR").toUpperCase();

  const now = new Date();
  try {
    await EsimNumberAdjustment.create({
      key: input.key,
      number: card._id,
      msisdn: card.msisdn,
      direction: input.direction,
      amountMinor: input.amountMinor,
      currency,
      reason: reason.slice(0, 500),
      admin: input.admin,
      balanceBeforeMinor: balanceMinor,
      nextAttemptAt: now,
      history: [{ at: now, event: "queued", detail: `${input.direction === "add" ? "+" : "−"}${formatAmount(input.amountMinor, currency)} +${card.msisdn}` }],
    });
  } catch (error) {
    // The same key sent twice at once: report the one that was kept.
    if ((error as { code?: number }).code !== 11000) throw error;
    const kept = await EsimNumberAdjustment.findOne({ key: input.key }).lean<IEsimNumberAdjustment | null>();
    if (kept) return reported(kept, false);
    throw error;
  }

  await processCardAdjustments({ number: input.numberId, budgetMs: 25_000 });
  const after = await freshCard(input.numberId);
  const balanceAfter = after?.card?.balanceMinor;
  if (typeof balanceAfter === "number") {
    await EsimNumberAdjustment.updateOne({ key: input.key, state: "completed" }, { $set: { balanceAfterMinor: balanceAfter } });
  }
  const saved = await EsimNumberAdjustment.findOne({ key: input.key }).lean<IEsimNumberAdjustment | null>();
  if (!saved) return { ok: false, message: "The change could not be saved" };
  return reported(saved, true, after?.card?.balanceMinor ?? null);
}

function reported(row: IEsimNumberAdjustment, created: boolean, balanceMinor: number | null = row.balanceAfterMinor ?? null): AdjustCardResult {
  if (row.state === "failed") return { ok: false, message: row.lastError?.message ?? "TopConnect refused the change" };
  return { ok: true, created, adjustment: view(row), balanceMinor, currency: row.currency };
}

// ── carrying them out ────────────────────────────────────────────────────

const legOf = (row: IEsimNumberAdjustment): MoneyLeg => ({
  doc: row,
  model: EsimNumberAdjustment,
  field: "transfer",
  msisdn: row.msisdn,
  currency: row.currency,
  ref: `adjustment:${String(row._id)}`,
});

async function settle(row: IEsimNumberAdjustment, state: "completed" | "failed" | "manual", detail: string) {
  const now = new Date();
  await EsimNumberAdjustment.updateOne(
    { _id: row._id },
    {
      $set: { state, ...(state === "completed" ? { completedAt: now, lastError: null } : { lastError: { code: state, message: detail.slice(0, 500), at: now } }) },
      $push: { history: { at: now, event: state, detail: detail.slice(0, 300) } },
    },
  );
  if (state === "manual") {
    const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");
    await notifyAdminsPaymentAnomaly({
      title: "Number card credit change: check TopConnect by hand",
      message: `${row.direction === "add" ? "Adding" : "Deducting"} ${formatAmount(row.amountMinor, row.currency)} on +${row.msisdn}: ${detail}`.slice(0, 500),
      dedupeKey: `esim-number-adjustment-manual:${row._id}`,
    }).catch(console.error);
  }
}

async function later(row: IEsimNumberAdjustment, detail?: string) {
  await EsimNumberAdjustment.updateOne(
    { _id: row._id },
    {
      $set: { state: "processing", nextAttemptAt: new Date(Date.now() + WAIT_MS), ...(detail ? { lastError: { code: "uncertain", message: detail.slice(0, 500), at: new Date() } } : {}) },
      $push: { history: { at: new Date(), event: "waiting", detail: detail?.slice(0, 300) } },
    },
  );
}

async function processOne(context: TopConnectContext, row: IEsimNumberAdjustment) {
  await EsimNumberAdjustment.updateOne({ _id: row._id }, { $set: { state: "processing" } });
  const moved = await moveMoney(context, legOf(row), signedTransferMinor(row.direction, row.amountMinor));
  switch (moved.result) {
    case "done":
      return settle(row, "completed", "Moved");
    case "wait":
      return later(row, moved.message);
    case "refused":
      return settle(row, "failed", `TopConnect refused: ${moved.message ?? "refused"}`);
    case "manual":
      return settle(row, "manual", moved.message ?? "The transfer was not settled");
  }
}

/** Carries out due adjustments (one card's, or any for the cron) under the TopConnect lock. */
export async function processCardAdjustments(options: { number?: string; limit?: number; budgetMs?: number } = {}) {
  const result = { completed: 0, failed: 0, manual: 0, waiting: 0 };
  const filter: Record<string, unknown> = { state: { $in: ["queued", "processing"] }, nextAttemptAt: { $lte: new Date() } };
  if (options.number) filter.number = new mongoose.Types.ObjectId(options.number);
  if (!(await EsimNumberAdjustment.exists(filter))) return result;
  const started = Date.now();
  await underTopConnectLock(async (context, renew) => {
    const rows = await EsimNumberAdjustment.find(filter).sort({ nextAttemptAt: 1, createdAt: 1 }).limit(options.limit ?? 20);
    for (const row of rows) {
      if (Date.now() - started > (options.budgetMs ?? 20_000)) break;
      await renew();
      try {
        await processOne(context, row);
      } catch (error) {
        await later(row, error instanceof Error ? error.message : String(error));
      }
      const state = (await EsimNumberAdjustment.findById(row._id).select({ state: 1 }).lean())?.state;
      if (state === "completed") result.completed += 1;
      else if (state === "failed") result.failed += 1;
      else if (state === "manual") result.manual += 1;
      else result.waiting += 1;
    }
  });
  return result;
}
