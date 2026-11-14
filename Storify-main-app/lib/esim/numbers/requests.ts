import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberOp } from "@/models/esim-number-op.model";
import { EsimNumberTransfer } from "@/models/esim-number-transfer.model";
import { EsimNumberRequest, type IEsimNumberRequest } from "@/models/esim-number-request.model";
import { formatAmount } from "@/lib/esim/numbers/line";
import { parseReplacementCard, sameIccid } from "@/lib/esim/numbers/import";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { refreshNumberCard } from "@/lib/esim/numbers/account";
import { noticeQrAnswered } from "@/lib/esim/numbers/request-notices";
import { getNumberSettings } from "@/lib/esim/numbers/settings";
import { moveMoney, underTopConnectLock, type MoneyLeg, type TopConnectContext } from "@/lib/esim/numbers/ops";
import { afterQrLeg, afterReleaseLeg, canAffordQr, creditToClear, type QrLeg } from "@/lib/esim/numbers/request-policy";

/**
 * Asking for things about a number card (lib: models/esim-number-request):
 * a new QR code (fee off the card's credit, then a person orders it from
 * TopConnect and pastes the new card, which the number moves to), moving the number to another
 * account, and giving it up (its credit is then taken off the card).
 */

const WAIT_MS = 2 * 60_000;
const owned = (userId: string) => ({ customer: new mongoose.Types.ObjectId(userId), status: "sold" as const });
const valid = (...ids: string[]) => ids.every((id) => mongoose.isValidObjectId(id));

export type RequestResult = { ok: true; state: IEsimNumberRequest["state"]; message?: string } | { ok: false; message: string };

/** Work on the number still under way, which a move or release must not cut through. */
async function busyWith(numberId: mongoose.Types.ObjectId): Promise<string | null> {
  const [ops, transfers, requests] = await Promise.all([
    EsimNumberOp.exists({ number: numberId, state: { $in: ["queued", "processing"] } }),
    EsimNumberTransfer.exists({ $or: [{ "from.number": numberId }, { "to.number": numberId }], state: { $in: ["queued", "processing"] } }),
    EsimNumberRequest.exists({ number: numberId, state: { $in: ["queued", "charging", "pending", "refunding"] } }),
  ]);
  if (ops) return "A recharge or data package is still being added to this number";
  if (transfers) return "A credit transfer on this number is still being made";
  if (requests) return "A request for this number is still open";
  return null;
}

// ── a new QR code ────────────────────────────────────────────────────────

/** The open or latest new-QR-code request of a number, for its page. */
export async function latestQrRequest(numberId: string) {
  if (!valid(numberId)) return null;
  return EsimNumberRequest.findOne({ number: numberId, kind: "qr" })
    .sort({ createdAt: -1 })
    .select({ state: 1, feeMinor: 1, currency: 1, createdAt: 1, completedAt: 1, resolution: 1, lastError: 1 })
    .lean();
}

/**
 * Asks for a new QR code for one of the shopper's numbers. The fee comes off
 * the card's credit, which must keep at least a cent. Once per `key`. Null
 * when the number is not the shopper's.
 */
export async function requestNewQr(userId: string, numberId: string, key: string): Promise<RequestResult | null> {
  if (!valid(userId, numberId)) return null;
  const customer = new mongoose.Types.ObjectId(userId);
  const earlier = await EsimNumberRequest.findOne({ customer, key }).lean();
  if (earlier) return reported(earlier);
  if (!(await EsimNumber.exists({ _id: numberId, ...owned(userId) }))) return null;

  const settings = await getNumberSettings();
  if (!settings.qrEnabled) return { ok: false, message: "New QR codes cannot be requested right now; contact support" };
  if (await EsimNumberRequest.exists({ number: numberId, kind: "qr", state: { $in: ["queued", "charging", "pending", "refunding"] } })) {
    return { ok: false, message: "A new QR code for this number has already been requested" };
  }
  await refreshNumberCard(numberId, { force: true });
  const row = await EsimNumber.findOne({ _id: numberId, ...owned(userId) }).select({ msisdn: 1, card: 1 }).lean();
  if (!row) return null;
  if (row.card?.blocked) return { ok: false, message: "This number is blocked" };
  const currency = (row.card?.currency ?? "EUR").toUpperCase();
  const fee = settings.qrFeeMinor;
  const affordable = canAffordQr(row.card?.balanceMinor, fee);
  if (affordable !== true) {
    return { ok: false, message: affordable === "unknown" ? "The balance could not be read; refresh and try again" : `The number needs more than ${formatAmount(fee, currency)} of credit for this; add credit first` };
  }

  const now = new Date();
  try {
    await EsimNumberRequest.create({
      kind: "qr",
      customer,
      key,
      number: row._id,
      msisdn: row.msisdn,
      feeMinor: fee,
      currency,
      // A free request needs no charge: it goes straight to a person.
      state: fee > 0 ? "queued" : "pending",
      charge: fee > 0 ? {} : { orderId: null, tries: 0, done: true, at: now },
      nextAttemptAt: now,
      history: [{ at: now, event: "requested", detail: fee > 0 ? `fee ${formatAmount(fee, currency)}` : "free" }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  await processNumberRequests({ customer: userId, budgetMs: 20_000 });
  const saved = await EsimNumberRequest.findOne({ customer, key }).lean();
  if (!saved) return { ok: false, message: "The request could not be saved" };
  // A free request skipped the charge, which tells the admins once the fee is taken.
  if (saved.state === "pending" && saved.feeMinor === 0) await tellAdmins(saved);
  await refreshNumberCard(numberId, { force: true });
  return reported(saved);
}

function reported(request: Pick<IEsimNumberRequest, "kind" | "state" | "lastError" | "resolution">): RequestResult {
  // A given-up number has left the account whatever became of its credit.
  if (request.kind === "release") {
    return request.state === "completed" ? { ok: true, state: "completed" } : { ok: true, state: request.state, message: "The number was removed; its remaining credit is being cleared" };
  }
  switch (request.state) {
    case "failed":
      return { ok: false, message: request.lastError?.message ?? "The request was refused" };
    case "rejected":
      return { ok: false, message: request.resolution?.note ?? "The request was declined; the fee went back on the number" };
    case "completed":
      return { ok: true, state: "completed" };
    case "manual":
      return { ok: true, state: "manual", message: "We are checking this request and will put it right" };
    case "pending":
      return { ok: true, state: "pending", message: "Requested. The new QR code usually takes about an hour" };
    default:
      return { ok: true, state: request.state, message: "The fee is being taken; this shows within a few minutes" };
  }
}

async function tellAdmins(request: Pick<IEsimNumberRequest, "_id" | "msisdn" | "feeMinor" | "currency">) {
  const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");
  await notifyAdminsPaymentAnomaly({
    title: "New QR code requested",
    message: `+${request.msisdn} needs a new QR code (fee ${formatAmount(request.feeMinor, request.currency)} taken). Order it from TopConnect, move the number to the new ICCID there, then paste the new card (ICCID LPA PIN1 PUK1 PIN2 PUK2) under Admin → eSIM → Numbers.`,
    dedupeKey: `esim-number-qr:${String(request._id)}`,
    link: "/admin/esim/numbers",
  }).catch(console.error);
}

// ── carrying the charge and refund out ───────────────────────────────────

const legOf = (request: IEsimNumberRequest, leg: QrLeg): MoneyLeg => ({
  doc: request,
  model: EsimNumberRequest,
  field: leg,
  msisdn: request.msisdn,
  currency: request.currency,
  ref: `number-request:${String(request._id)}`,
});

async function settle(request: IEsimNumberRequest, state: IEsimNumberRequest["state"], detail: string) {
  const now = new Date();
  const ends = state === "completed" || state === "rejected" || state === "failed";
  await EsimNumberRequest.updateOne(
    { _id: request._id },
    {
      $set: {
        state,
        ...(ends ? { completedAt: now } : {}),
        ...(state === "failed" || state === "manual" ? { lastError: { code: state, message: detail.slice(0, 500), at: now } } : {}),
      },
      $push: { history: { at: now, event: state, detail: detail.slice(0, 300) } },
    },
  );
  if (state === "manual") {
    const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");
    await notifyAdminsPaymentAnomaly({
      title: "Number request: check TopConnect by hand",
      message: `+${request.msisdn} ${formatAmount(request.feeMinor, request.currency)}: ${detail}`.slice(0, 500),
      dedupeKey: `esim-number-request-manual:${request._id}`,
    }).catch(console.error);
  }
}

async function later(request: IEsimNumberRequest, detail?: string) {
  await EsimNumberRequest.updateOne(
    { _id: request._id },
    {
      $set: { nextAttemptAt: new Date(Date.now() + WAIT_MS), ...(detail ? { lastError: { code: "uncertain", message: detail.slice(0, 500), at: new Date() } } : {}) },
      $push: { history: { at: new Date(), event: "waiting", detail: detail?.slice(0, 300) } },
    },
  );
}

/** Takes a given-up number's credit off the card. */
async function clearCredit(context: TopConnectContext, request: IEsimNumberRequest) {
  await EsimNumberRequest.updateOne({ _id: request._id }, { $set: { state: "charging" } });
  const moved = await moveMoney(context, legOf(request, "charge"), -request.feeMinor);
  const why = moved.message ?? moved.result;
  switch (afterReleaseLeg(moved.result)) {
    case "completed":
      return settle(request, "completed", `${formatAmount(request.feeMinor, request.currency)} of credit cleared`);
    case "wait":
      return later(request, moved.message);
    case "manual":
      return settle(request, "manual", `Given up, but clearing its ${formatAmount(request.feeMinor, request.currency)} of credit failed (${why}): take it off the card by hand`);
  }
}

async function processOne(context: TopConnectContext, request: IEsimNumberRequest) {
  if (request.kind === "release") return clearCredit(context, request);
  const leg: QrLeg = request.state === "refunding" ? "refund" : "charge";
  if (leg === "charge") await EsimNumberRequest.updateOne({ _id: request._id }, { $set: { state: "charging" } });
  const moved = await moveMoney(context, legOf(request, leg), leg === "charge" ? -request.feeMinor : request.feeMinor);
  const next = afterQrLeg(leg, moved.result);
  const why = moved.message ?? moved.result;
  switch (next) {
    case "wait":
      return later(request, moved.message);
    case "pending":
      await settle(request, "pending", "fee taken");
      return tellAdmins(request);
    case "failed":
      return settle(request, "failed", `TopConnect refused the fee: ${why}`);
    case "rejected":
      return settle(request, "rejected", "fee put back on the number");
    case "manual":
      return settle(request, "manual", leg === "refund" ? `Putting the fee back on +${request.msisdn} failed (${why})` : `The fee was not settled (${why})`);
  }
}

/**
 * Takes due fees, puts back refused ones and clears given-up numbers' credit
 * (one shopper's, or any for the cron) under the TopConnect lock.
 */
export async function processNumberRequests(options: { customer?: string; limit?: number; budgetMs?: number } = {}) {
  const result = { pending: 0, completed: 0, failed: 0, rejected: 0, manual: 0, waiting: 0 };
  const filter: Record<string, unknown> = { kind: { $in: ["qr", "release"] }, state: { $in: ["queued", "charging", "refunding"] }, nextAttemptAt: { $lte: new Date() } };
  if (options.customer) filter.customer = new mongoose.Types.ObjectId(options.customer);
  if (!(await EsimNumberRequest.exists(filter))) return result;
  const started = Date.now();
  await underTopConnectLock(async (context, renew) => {
    const rows = await EsimNumberRequest.find(filter).sort({ nextAttemptAt: 1, createdAt: 1 }).limit(options.limit ?? 20);
    for (const request of rows) {
      if (Date.now() - started > (options.budgetMs ?? 20_000)) break;
      await renew();
      try {
        await processOne(context, request);
      } catch (error) {
        await later(request, error instanceof Error ? error.message : String(error));
      }
      const state = (await EsimNumberRequest.findById(request._id).select({ state: 1 }).lean())?.state;
      if (state === "pending" || state === "failed" || state === "rejected" || state === "manual") result[state] += 1;
      else if (state === "completed") result.completed += 1;
      else result.waiting += 1;
    }
  });
  return result;
}

// ── a person's answer (Admin → eSIM → Numbers) ───────────────────────────

export async function listQrRequests(options: { open?: boolean; limit?: number } = {}) {
  await connectDB();
  const filter: Record<string, unknown> = options.open === false ? { kind: "qr" } : { kind: "qr", state: { $in: ["pending", "manual", "queued", "charging", "refunding"] } };
  const rows = await EsimNumberRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit ?? 50)
    .populate<{ customer: { _id: mongoose.Types.ObjectId; email?: string; name?: string } | null }>("customer", { email: 1, name: 1 })
    .lean();
  return rows.map((row) => ({
    id: String(row._id),
    numberId: String(row.number),
    msisdn: row.msisdn,
    customer: row.customer ? { id: String(row.customer._id), email: row.customer.email ?? null, name: row.customer.name ?? null } : null,
    feeMinor: row.feeMinor,
    currency: row.currency,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    lastError: row.lastError?.message ?? null,
  }));
}

export type AdminAnswer = { ok: true; before: Record<string, unknown>; after: Record<string, unknown> } | { ok: false; message: string };

const REPLACEMENT_PROBLEMS = {
  fields: "Paste one line: ICCID LPA PIN1 PUK1 PIN2 PUK2, split by spaces",
  iccid: "The first field must be the new ICCID (18–22 digits)",
  lpa: "The second field must be the full activation code: LPA:1$address$code",
  pin: "PIN and PUK codes must be 4–10 digits",
} as const;

/**
 * The new card is in: the number moves to the new ICCID with its activation
 * code and PIN/PUK codes, and the request is done. The number must already
 * be on that ICCID at TopConnect (`card_stat` is asked, nothing is changed
 * there); the ICCID may not belong to another number here.
 */
export async function completeQrRequest(adminId: string, requestId: string, input: { card: string; note?: string | null }): Promise<AdminAnswer> {
  if (!valid(requestId)) return { ok: false, message: "Request not found" };
  const parsed = parseReplacementCard(input.card);
  if (!parsed.ok) return { ok: false, message: REPLACEMENT_PROBLEMS[parsed.reason] };
  const next = parsed.card;
  const request = await EsimNumberRequest.findOne({ _id: requestId, kind: "qr" });
  if (!request) return { ok: false, message: "Request not found" };
  if (request.state !== "pending" && request.state !== "manual") return { ok: false, message: "This request is not waiting for a new code" };
  const number = await EsimNumber.findById(request.number).select({ msisdn: 1, iccid: 1, install: 1 });
  if (!number) return { ok: false, message: "Number not found" };
  if (sameIccid(number.iccid, next.iccid)) return { ok: false, message: "This is the ICCID the number already has; paste the new card's line" };
  if (number.install.lpa === next.lpa) return { ok: false, message: "This is the activation code the number already has" };
  const other = await EsimNumber.findOne({ _id: { $ne: number._id }, iccid: { $in: [next.iccid, next.iccid.replace(/F$/, ""), `${next.iccid.replace(/F$/, "")}F`] } }).select({ msisdn: 1 }).lean();
  if (other) return { ok: false, message: `This ICCID belongs to +${other.msisdn} here` };
  const atTopConnect = await topConnectIccid(String(number._id), number.msisdn);
  if (!atTopConnect.ok) return atTopConnect;
  if (atTopConnect.iccid && !sameIccid(atTopConnect.iccid, next.iccid)) {
    return { ok: false, message: `TopConnect still has +${number.msisdn} on ICCID …${atTopConnect.iccid.slice(-6)}. Move the number to the new ICCID at TopConnect first` };
  }

  // The audit log names the activation codes by their last characters, never in full, and no PIN or PUK.
  const masked = (code: string) => `…${code.slice(-6)}`;
  const before = { iccid: number.iccid, lpa: masked(number.install.lpa) };
  const previous = number.iccid;
  number.set("iccid", next.iccid);
  number.set("install", { lpa: next.lpa, pin1: next.pin1, puk1: next.puk1, pin2: next.pin2, puk2: next.puk2 });
  // Read the card again below (it is the new card now), rather than show the old one's state.
  number.set("card", null);
  await number.save();
  const now = new Date();
  await EsimNumberRequest.updateOne(
    { _id: request._id },
    {
      $set: { state: "completed", completedAt: now, resolution: { by: mongoose.isValidObjectId(adminId) ? new mongoose.Types.ObjectId(adminId) : null, at: now, note: input.note?.trim() || null } },
      $push: { history: { at: now, event: "completed", detail: `moved to ICCID ${next.iccid} (was ${previous}); new activation code saved` } },
    },
  );
  await refreshNumberCard(String(number._id), { force: true }).catch(() => false);
  await noticeQrAnswered(requestId);
  return { ok: true, before: { request: requestId, ...before }, after: { request: requestId, iccid: next.iccid, lpa: masked(next.lpa), pinsGiven: [next.pin1, next.puk1, next.pin2, next.puk2].filter(Boolean).length } };
}

/** The ICCID TopConnect has the number on now (null when its answer names none). */
async function topConnectIccid(numberId: string, msisdn: string): Promise<{ ok: true; iccid: string | null } | { ok: false; message: string }> {
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") return { ok: false, message: "TopConnect is not set up, so the new ICCID cannot be checked" };
  try {
    const client = topConnectClient(credentialsOf(provider));
    const { card } = await withProviderLog(
      { provider: provider._id as mongoose.Types.ObjectId, providerCode: "topconnect", operation: "numbers.card", request: { msisdn, number: numberId } },
      () => client.cardStatus({ msisdn }),
      (result) => ({ iccid: result.card.iccid }),
    );
    return { ok: true, iccid: card.iccid?.trim() || null };
  } catch (error) {
    return { ok: false, message: `Could not check the number at TopConnect (${error instanceof Error ? error.message : String(error)}); try again` };
  }
}

/** Declined: the fee goes back on the card (or the request just closes when nothing was taken). */
export async function rejectQrRequest(adminId: string, requestId: string, note: string): Promise<AdminAnswer> {
  if (!valid(requestId)) return { ok: false, message: "Request not found" };
  const request = await EsimNumberRequest.findOne({ _id: requestId, kind: "qr" });
  if (!request) return { ok: false, message: "Request not found" };
  if (request.state !== "pending") return { ok: false, message: "Only a request waiting for a person can be declined" };
  const now = new Date();
  const taken = request.feeMinor > 0 && request.charge?.done;
  await EsimNumberRequest.updateOne(
    { _id: request._id },
    {
      $set: {
        state: taken ? "refunding" : "rejected",
        ...(taken ? { refund: { orderId: null, tries: 0, done: false, at: null }, nextAttemptAt: now } : { completedAt: now }),
        resolution: { by: mongoose.isValidObjectId(adminId) ? new mongoose.Types.ObjectId(adminId) : null, at: now, note: note.trim().slice(0, 500) || null },
      },
      $push: { history: { at: now, event: "declined", detail: note.trim().slice(0, 300) } },
    },
  );
  if (taken) await processNumberRequests({ customer: String(request.customer), budgetMs: 15_000 });
  await noticeQrAnswered(requestId);
  return { ok: true, before: { request: requestId, state: "pending" }, after: { request: requestId, state: taken ? "refunding" : "rejected" } };
}

// ── moving the number to another account, and giving it up ─────────────

/**
 * Moves one of the shopper's numbers to another account, found by its
 * email. Permanent; once per `key`. Null when the number is not the shopper's.
 */
export async function transferNumberOwnership(userId: string, numberId: string, input: { email: string; key: string }): Promise<RequestResult | null> {
  if (!valid(userId, numberId)) return null;
  const customer = new mongoose.Types.ObjectId(userId);
  const earlier = await EsimNumberRequest.findOne({ customer, key: input.key }).lean();
  if (earlier) return reported(earlier);
  const row = await EsimNumber.findOne({ _id: numberId, ...owned(userId) }).select({ msisdn: 1, card: 1 }).lean();
  if (!row) return null;
  const email = input.email.trim().toLowerCase();
  const target = await User.findOne({ email }).select({ _id: 1 }).lean<{ _id: mongoose.Types.ObjectId } | null>();
  if (!target) return { ok: false, message: "No account uses this email" };
  if (target._id.equals(customer)) return { ok: false, message: "This number is already on your account" };
  const busy = await busyWith(row._id);
  if (busy) return { ok: false, message: busy };

  const now = new Date();
  // Only while it is still this shopper's: two moves at once cannot both win.
  const moved = await EsimNumber.updateOne({ _id: row._id, ...owned(userId) }, { $set: { customer: target._id, remark: null } });
  if (!moved.modifiedCount) return { ok: false, message: "The number could not be moved; refresh and try again" };
  await EsimNumberRequest.create({
    kind: "transfer",
    customer,
    key: input.key,
    number: row._id,
    msisdn: row.msisdn,
    currency: (row.card?.currency ?? "EUR").toUpperCase(),
    state: "completed",
    toCustomer: target._id,
    nextAttemptAt: now,
    completedAt: now,
    history: [{ at: now, event: "completed", detail: `moved to account ${String(target._id)}` }],
  });
  return { ok: true, state: "completed" };
}

/**
 * Gives one of the shopper's numbers up: it leaves the account and is
 * retired (a person decides whether it is sold again), and any credit left
 * on the card is taken off it through TopConnect, so it starts again at 0.
 * The balance is read fresh first; one that cannot be read stops the
 * release. `confirm` must be the number's digits. Once per `key`. Null
 * when the number is not the shopper's.
 */
export async function releaseNumber(userId: string, numberId: string, input: { confirm: string; key: string }): Promise<RequestResult | null> {
  if (!valid(userId, numberId)) return null;
  const customer = new mongoose.Types.ObjectId(userId);
  const earlier = await EsimNumberRequest.findOne({ customer, key: input.key }).lean();
  if (earlier) return reported(earlier);
  const listed = await EsimNumber.findOne({ _id: numberId, ...owned(userId) }).select({ msisdn: 1 }).lean();
  if (!listed) return null;
  if (input.confirm.replace(/\D/g, "") !== listed.msisdn) return { ok: false, message: "Type the number exactly to confirm" };
  const busy = await busyWith(listed._id);
  if (busy) return { ok: false, message: busy };
  if (!(await refreshNumberCard(numberId, { force: true }))) return { ok: false, message: "The balance could not be read; refresh and try again" };
  const row = await EsimNumber.findOne({ _id: numberId, ...owned(userId) }).select({ msisdn: 1, card: 1, note: 1 }).lean();
  if (!row) return null;
  const credit = creditToClear(row.card?.balanceMinor);
  if (credit === "unknown") return { ok: false, message: "The balance could not be read; refresh and try again" };
  const currency = (row.card?.currency ?? "EUR").toUpperCase();

  const now = new Date();
  const note = [row.note, `Given up by the customer on ${now.toISOString().slice(0, 10)}`].filter(Boolean).join("\n").slice(0, 500);
  const released = await EsimNumber.updateOne({ _id: row._id, ...owned(userId) }, { $set: { status: "retired", customer: null, remark: null, note } });
  if (!released.modifiedCount) return { ok: false, message: "The number could not be removed; refresh and try again" };
  await EsimNumberRequest.create({
    kind: "release",
    customer,
    key: input.key,
    number: row._id,
    msisdn: row.msisdn,
    feeMinor: credit,
    currency,
    // With credit left it is cleared next (here, or by the cron if TopConnect is busy).
    state: credit > 0 ? "queued" : "completed",
    nextAttemptAt: now,
    ...(credit > 0 ? {} : { completedAt: now }),
    history: [{ at: now, event: "given up", detail: credit > 0 ? `${formatAmount(credit, currency)} of credit to clear` : "no credit on the card" }],
  });
  if (credit > 0) await processNumberRequests({ customer: userId, budgetMs: 20_000 });
  const saved = await EsimNumberRequest.findOne({ customer, key: input.key }).lean();
  return saved ? reported(saved) : { ok: true, state: "completed" };
}
