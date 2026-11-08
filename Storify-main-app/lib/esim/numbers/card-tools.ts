import "server-only";

import { mongoose } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberTransfer, type IEsimNumberTransfer } from "@/models/esim-number-transfer.model";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { formatAmount } from "@/lib/esim/numbers/line";
import { refreshNumberCard } from "@/lib/esim/numbers/account";
import { moveMoney, underTopConnectLock, type MoneyLeg, type TopConnectContext } from "@/lib/esim/numbers/ops";
import { afterCardTransferLeg, type CardTransferLeg } from "@/lib/esim/numbers/op-policy";

/**
 * What a shopper does with a number card beyond paying for it, as the live
 * store offers: send a text message to the number ("send SMS to myself", to
 * check it receives), and move credit from one of their numbers to another
 * ("Transfer balance"). Only between the shopper's own numbers.
 */

const WAIT_MS = 2 * 60_000;
/** The live store's default sender for "SMS to myself". */
export const DEFAULT_SMS_SENDER = "37259500001";

const owned = (userId: string) => ({ customer: new mongoose.Types.ObjectId(userId), status: "sold" as const });

// ── a text message to the number ─────────────────────────────────────────

/** Null when the number is not the shopper's. */
export async function sendSmsToOwnNumber(userId: string, numberId: string, input: { from: string; message: string }): Promise<{ sent: boolean; message?: string } | null> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId)) return null;
  const row = await EsimNumber.findOne({ _id: numberId, ...owned(userId) }).select({ msisdn: 1 }).lean();
  if (!row) return null;
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") return { sent: false, message: "Sending messages is not available right now" };
  try {
    const client = topConnectClient(credentialsOf(provider));
    await withProviderLog(
      { provider: provider._id as mongoose.Types.ObjectId, providerCode: "topconnect", operation: "numbers.sms", request: { from: input.from, to: row.msisdn, length: input.message.length } },
      () => client.sendSms({ command: "sms2", from: input.from, to: row.msisdn, message: input.message }),
    );
    return { sent: true };
  } catch (error) {
    return { sent: false, message: error instanceof Error ? error.message : "TopConnect refused" };
  }
}

// ── credit from one number to another ───────────────────────────────────

export type TransferRequestResult =
  | { ok: true; state: IEsimNumberTransfer["state"]; message?: string }
  | { ok: false; message: string };

/**
 * Moves `amountMinor` (the cards' currency) from one of the shopper's
 * numbers to any TopConnect number (`toMsisdn`, digits with the country
 * code), as the live store does; a number TopConnect does not know refuses
 * the credit, and the money goes back. Once per `key`: a repeated request reports the first
 * one. Carried out now when TopConnect's lock is free, else within a few
 * minutes by the cron. Null when the source number is not the shopper's.
 */
export async function requestCardTransfer(userId: string, numberId: string, input: { toMsisdn: string; amountMinor: number; key: string }): Promise<TransferRequestResult | null> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId)) return null;
  const customer = new mongoose.Types.ObjectId(userId);
  const earlier = await EsimNumberTransfer.findOne({ customer, key: input.key }).lean();
  if (earlier) return reported(earlier);

  if (!(await EsimNumber.exists({ _id: numberId, ...owned(userId) }))) return null;
  const toMsisdn = input.toMsisdn.replace(/[\s()+-]/g, "");
  if (!/^\d{6,15}$/.test(toMsisdn)) return { ok: false, message: "Enter the number with its country code" };
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) return { ok: false, message: "Enter an amount" };
  if (await EsimNumberTransfer.exists({ "from.number": numberId, state: { $in: ["queued", "processing"] } })) {
    return { ok: false, message: "A transfer from this number is still being made; try again in a few minutes" };
  }
  // The balance as TopConnect has it now.
  await refreshNumberCard(numberId, { force: true });
  const [from, to] = await Promise.all([
    EsimNumber.findOne({ _id: numberId, ...owned(userId) }).select({ msisdn: 1, card: 1 }).lean(),
    // Ours when it is one of the store's numbers: then its card is known.
    EsimNumber.findOne({ msisdn: toMsisdn, status: "sold" }).select({ msisdn: 1, card: 1 }).lean(),
  ]);
  if (!from) return null;
  if (toMsisdn === from.msisdn) return { ok: false, message: "Choose another number" };
  // Only the platform's own numbers: never someone else's card at TopConnect.
  if (!to) return { ok: false, message: "This number is not one of the platform's numbers" };
  if (from.card?.blocked || to?.card?.blocked) return { ok: false, message: "A blocked number cannot send or receive credit" };
  const currency = (from.card?.currency ?? "EUR").toUpperCase();
  if (to?.card?.currency && to.card.currency.toUpperCase() !== currency) return { ok: false, message: "The two numbers keep credit in different currencies" };
  const balance = from.card?.balanceMinor;
  if (typeof balance !== "number") return { ok: false, message: "The balance could not be read; refresh and try again" };
  if (input.amountMinor > balance) return { ok: false, message: `The number has ${formatAmount(balance, currency)}` };

  const now = new Date();
  try {
    await EsimNumberTransfer.create({
      customer,
      key: input.key,
      from: { number: from._id, msisdn: from.msisdn },
      to: { number: to?._id ?? null, msisdn: toMsisdn },
      amountMinor: input.amountMinor,
      currency,
      nextAttemptAt: now,
      history: [{ at: now, event: "queued", detail: `${formatAmount(input.amountMinor, currency)} +${from.msisdn} → +${toMsisdn}` }],
    });
  } catch (error) {
    // The same key sent twice at once: report the one that was kept.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  await processCardTransfers({ customer: userId, budgetMs: 25_000 });
  const saved = await EsimNumberTransfer.findOne({ customer, key: input.key }).lean();
  if (!saved) return { ok: false, message: "The transfer could not be saved" };
  await Promise.all([refreshNumberCard(String(saved.from.number), { force: true }), saved.to.number ? refreshNumberCard(String(saved.to.number), { force: true }) : null]);
  return reported(saved);
}

function reported(transfer: Pick<IEsimNumberTransfer, "state" | "lastError">): TransferRequestResult {
  if (transfer.state === "completed") return { ok: true, state: "completed" };
  if (transfer.state === "failed") return { ok: false, message: transfer.lastError?.message ?? "The transfer was refused" };
  if (transfer.state === "manual") return { ok: true, state: "manual", message: "We are checking this transfer and will put it right" };
  return { ok: true, state: transfer.state, message: "The transfer is being made and shows within a few minutes" };
}


// ── carrying the moves out ───────────────────────────────────────────────

const legOf = (transfer: IEsimNumberTransfer, leg: CardTransferLeg): MoneyLeg => ({
  doc: transfer,
  model: EsimNumberTransfer,
  field: leg,
  msisdn: leg === "credit" ? transfer.to.msisdn : transfer.from.msisdn,
  currency: transfer.currency,
  ref: `transfer:${String(transfer._id)}`,
});

async function settle(transfer: IEsimNumberTransfer, state: "completed" | "failed" | "manual", detail: string) {
  const now = new Date();
  await EsimNumberTransfer.updateOne(
    { _id: transfer._id },
    {
      $set: { state, ...(state === "completed" ? { completedAt: now, lastError: null } : { lastError: { code: state, message: detail.slice(0, 500), at: now } }) },
      $push: { history: { at: now, event: state, detail: detail.slice(0, 300) } },
    },
  );
  if (state === "manual") {
    const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");
    await notifyAdminsPaymentAnomaly({
      title: "Number card transfer: check TopConnect by hand",
      message: `${formatAmount(transfer.amountMinor, transfer.currency)} +${transfer.from.msisdn} → +${transfer.to.msisdn}: ${detail}`.slice(0, 500),
      dedupeKey: `esim-number-transfer-manual:${transfer._id}`,
    }).catch(console.error);
  }
}

async function later(transfer: IEsimNumberTransfer, detail?: string) {
  await EsimNumberTransfer.updateOne(
    { _id: transfer._id },
    {
      $set: { state: "processing", nextAttemptAt: new Date(Date.now() + WAIT_MS), ...(detail ? { lastError: { code: "uncertain", message: detail.slice(0, 500), at: new Date() } } : {}) },
      $push: { history: { at: new Date(), event: "waiting", detail: detail?.slice(0, 300) } },
    },
  );
}

async function processOne(context: TopConnectContext, transfer: IEsimNumberTransfer) {
  await EsimNumberTransfer.updateOne({ _id: transfer._id }, { $set: { state: "processing" } });
  let leg: CardTransferLeg = !transfer.debit?.done ? "debit" : transfer.refund ? "refund" : "credit";
  for (;;) {
    const amount = leg === "debit" ? -transfer.amountMinor : transfer.amountMinor;
    const moved = await moveMoney(context, legOf(transfer, leg), amount);
    const next = afterCardTransferLeg(leg, moved.result);
    const why = moved.message ?? moved.result;
    switch (next) {
      case "wait":
        return later(transfer, moved.message);
      case "manual":
        return settle(transfer, "manual", leg === "refund" ? `Putting the credit back on +${transfer.from.msisdn} failed (${why}): it is on the dealer account` : `The ${leg} was not settled (${why})`);
      case "failed":
        return settle(transfer, "failed", `TopConnect refused: ${why}`);
      case "completed":
        return settle(transfer, "completed", "Moved");
      case "returned":
        return settle(transfer, "failed", `+${transfer.to.msisdn} could not take the credit, so it was put back`);
      case "refund": {
        // Marked before the first send, so a crash resumes with the refund, not the credit.
        const started = { orderId: null, tries: 0, done: false, at: null };
        await EsimNumberTransfer.updateOne({ _id: transfer._id }, { $set: { refund: started }, $push: { history: { at: new Date(), event: "credit refused", detail: why.slice(0, 300) } } });
        transfer.set("refund", started);
        leg = "refund";
        continue;
      }
      case "credit":
        leg = "credit";
        continue;
    }
  }
}

/** Carries out due moves (one shopper's, or any for the cron) under the TopConnect lock. */
export async function processCardTransfers(options: { customer?: string; limit?: number; budgetMs?: number } = {}) {
  const result = { completed: 0, failed: 0, manual: 0, waiting: 0 };
  const filter: Record<string, unknown> = { state: { $in: ["queued", "processing"] }, nextAttemptAt: { $lte: new Date() } };
  if (options.customer) filter.customer = new mongoose.Types.ObjectId(options.customer);
  if (!(await EsimNumberTransfer.exists(filter))) return result;
  const started = Date.now();
  await underTopConnectLock(async (context, renew) => {
    const rows = await EsimNumberTransfer.find(filter).sort({ nextAttemptAt: 1, createdAt: 1 }).limit(options.limit ?? 20);
    for (const transfer of rows) {
      if (Date.now() - started > (options.budgetMs ?? 20_000)) break;
      await renew();
      try {
        await processOne(context, transfer);
      } catch (error) {
        await later(transfer, error instanceof Error ? error.message : String(error));
      }
      const state = (await EsimNumberTransfer.findById(transfer._id).select({ state: 1 }).lean())?.state;
      if (state === "completed") result.completed += 1;
      else if (state === "failed") result.failed += 1;
      else if (state === "manual") result.manual += 1;
      else result.waiting += 1;
    }
  });
  return result;
}
