import "server-only";

import { createHash } from "node:crypto";
import { mongoose } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { refreshNumberCard } from "@/lib/esim/numbers/account";
import type {
  TopConnectActivity,
  TopConnectCallRecord,
  TopConnectLocationUpdate,
  TopConnectClient,
  TopConnectDataLimit,
  TopConnectDataRecord,
  TopConnectRecharge,
  TopConnectService,
} from "@/lib/esim/providers/topconnect";
import { forwardingAllowed, historyWindow, type HistoryDays } from "@/lib/esim/numbers/service-policy";

/**
 * A shopper's own number card, as the live store and other number shops
 * offer it: data, texts and calls switched on and off, voicemail and its
 * messages, call forwarding, and what the card did — calls, texts, data
 * sessions and money put on it. Each read and change goes to TopConnect for
 * the shopper's own sold number only; each change is written to the
 * provider log.
 */

export type NumberSwitch = TopConnectService | "voicemail";

export interface NumberServices {
  /** Null where TopConnect did not answer for that service. */
  data: boolean | null;
  sms: boolean | null;
  voice: boolean | null;
  voicemail: boolean | null;
  /** The number calls are forwarded to; null when they are not; undefined when unknown. */
  forwardTo: string | null | undefined;
  blocked: boolean;
}

export interface VoicemailEntry {
  id: string;
  at: string | null;
  from: string | null;
}

export interface NumberHistory {
  from: string;
  to: string;
  calls: TopConnectCallRecord[] | null;
  data: TopConnectDataRecord[] | null;
  recharges: TopConnectRecharge[] | null;
  voicemails: VoicemailEntry[] | null;
}

type Line = { id: mongoose.Types.ObjectId; msisdn: string; blocked: boolean };
type Gateway = { client: TopConnectClient; provider: mongoose.Types.ObjectId; fake: boolean };

async function ownedLine(userId: string, numberId: string): Promise<Line | null> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId)) return null;
  const row = await EsimNumber.findOne({ _id: numberId, customer: new mongoose.Types.ObjectId(userId), status: "sold" })
    .select({ msisdn: 1, "card.blocked": 1 })
    .lean<{ _id: mongoose.Types.ObjectId; msisdn: string; card?: { blocked?: boolean | null } | null }>();
  return row ? { id: row._id, msisdn: row.msisdn, blocked: row.card?.blocked === true } : null;
}

async function gateway(): Promise<Gateway | null> {
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") return null;
  const credentials = credentialsOf(provider);
  return {
    client: topConnectClient(credentials),
    provider: provider._id as mongoose.Types.ObjectId,
    fake: String(credentials.baseUrl ?? "").startsWith("fake://"),
  };
}

/** The value, or null when TopConnect refused or did not answer. */
async function settled<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

const failure = (error: unknown) => (error instanceof Error ? error.message : "TopConnect refused");

/** What the number's services are now. Null when it is not the shopper's. */
export async function numberServices(userId: string, numberId: string): Promise<NumberServices | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  const tc = await gateway();
  if (!tc) return { data: null, sms: null, voice: null, voicemail: null, forwardTo: undefined, blocked: line.blocked };
  const [data, sms, voice, voicemail, forwardTo] = await Promise.all([
    settled(() => tc.client.serviceStatus(line.msisdn, "data")),
    settled(() => tc.client.serviceStatus(line.msisdn, "sms")),
    settled(() => tc.client.serviceStatus(line.msisdn, "voice")),
    settled(async () => (await tc.client.voicemail(line.msisdn)).active),
    (async () => {
      try {
        return await tc.client.redirect(line.msisdn);
      } catch {
        return undefined;
      }
    })(),
  ]);
  return { data, sms, voice, voicemail, forwardTo, blocked: line.blocked };
}

export type ServiceChange = { ok: true; on: boolean } | { ok: false; message: string };

/**
 * Switches one service on or off. Setting what is already set is harmless
 * (TopConnect answers the same state), so a repeated request needs no key.
 * Null when the number is not the shopper's.
 */
export async function setNumberSwitch(userId: string, numberId: string, service: NumberSwitch, on: boolean): Promise<ServiceChange | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  if (line.blocked) return { ok: false, message: "This number is blocked" };
  // With data off the card can lose its signal: shoppers may only turn it back on.
  if (service === "data" && !on) return { ok: false, message: "Mobile data stays on so the number keeps its signal" };
  const tc = await gateway();
  if (!tc) return { ok: false, message: "Number services are not available right now" };
  try {
    const state = await withProviderLog(
      { provider: tc.provider, providerCode: "topconnect", operation: `numbers.service.${service}`, request: { number: String(line.id), on } },
      () => (service === "voicemail" ? tc.client.setVoicemail(line.msisdn, on).then((result) => result.active) : tc.client.setService(line.msisdn, service, on)),
    );
    return { ok: true, on: state };
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
}

export type ForwardChange = { ok: true; forwardTo: string | null } | { ok: false; message: string };

/** Forwards every call to `target` (with its country code), or stops forwarding with null. */
export async function setNumberForwarding(userId: string, numberId: string, target: string | null): Promise<ForwardChange | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  if (line.blocked) return { ok: false, message: "This number is blocked" };
  const digits = target === null ? null : target.replace(/[\s()+-]/g, "");
  if (digits !== null) {
    if (!/^\d{6,15}$/.test(digits)) return { ok: false, message: "Enter the number with its country code" };
    if (!forwardingAllowed(digits)) return { ok: false, message: "Calls can be forwarded only to numbers starting with +1, +3 or +4" };
    if (digits === line.msisdn) return { ok: false, message: "A number cannot forward to itself" };
  }
  const tc = await gateway();
  if (!tc) return { ok: false, message: "Number services are not available right now" };
  try {
    const forwardTo = await withProviderLog(
      { provider: tc.provider, providerCode: "topconnect", operation: "numbers.forward", request: { number: String(line.id), to: digits } },
      () => tc.client.setRedirect(line.msisdn, digits),
    );
    return { ok: true, forwardTo };
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
}

const voicemailId = (link: string) => createHash("sha256").update(link).digest("hex").slice(0, 24);

/**
 * What the card did over the last `days`: calls and texts, data sessions,
 * money put on it and voicemail messages. Each list is null when TopConnect
 * did not answer for it. Null when the number is not the shopper's.
 */
export async function numberHistory(userId: string, numberId: string, days: HistoryDays): Promise<NumberHistory | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  const { from, to } = historyWindow(days, new Date());
  const tc = await gateway();
  if (!tc) return { from, to, calls: null, data: null, recharges: null, voicemails: null };
  const [calls, data, recharges, voicemails] = await Promise.all([
    settled(() => tc.client.callRecords(line.msisdn, from, to)),
    settled(() => tc.client.dataRecords(line.msisdn, from, to)),
    settled(() => tc.client.recharges(line.msisdn, from, to)),
    settled(async () => (await tc.client.voicemailMessages(line.msisdn, from, to)).map((entry) => ({ id: voicemailId(entry.link), at: entry.at, from: entry.from }))),
  ]);
  return { from, to, calls, data, recharges, voicemails };
}

/** Largest recording passed on. */
const MAX_RECORDING_BYTES = 20 * 1024 * 1024;

export type Recording = { ok: true; body: ArrayBuffer; contentType: string } | { ok: false; message: string };

/**
 * One voicemail message's recording, fetched by the server so the gateway's
 * link never reaches the browser. Looked for in the last 90 days. Null when
 * the number is not the shopper's or the message is not found.
 */
export async function voicemailRecording(userId: string, numberId: string, messageId: string): Promise<Recording | null> {
  const line = await ownedLine(userId, numberId);
  if (!line || !/^[0-9a-f]{24}$/.test(messageId)) return null;
  const tc = await gateway();
  if (!tc) return { ok: false, message: "Number services are not available right now" };
  const { from, to } = historyWindow(90, new Date());
  const messages = await settled(() => tc.client.voicemailMessages(line.msisdn, from, to));
  const message = messages?.find((entry) => voicemailId(entry.link) === messageId);
  if (!message) return null;
  if (tc.fake) return { ok: false, message: "Recordings cannot be played with the test gateway" };
  let url: URL;
  try {
    url = new URL(message.link);
  } catch {
    return { ok: false, message: "The recording link is not valid" };
  }
  // Only TopConnect's own download address.
  if (url.protocol !== "https:" || !/(^|\.)travelsim\.com$/i.test(url.hostname)) return { ok: false, message: "The recording link is not valid" };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return { ok: false, message: "The recording could not be fetched" };
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_RECORDING_BYTES) return { ok: false, message: "The recording is too large" };
    const type = response.headers.get("content-type") ?? "";
    return { ok: true, body, contentType: /^audio\//i.test(type) ? type : "audio/wav" };
  } catch {
    return { ok: false, message: "The recording could not be fetched" };
  }
}

// ── troubleshooting ──────────────────────────────────────────────────────

export interface NumberDiagnostics {
  /** The latest of each kind of activity; null when TopConnect did not answer. */
  activity: TopConnectActivity[] | null;
  locations: TopConnectLocationUpdate[] | null;
  /** The data session open now: undefined when unknown. */
  session: { startedAt: string | null; mccmnc: string | null } | null | undefined;
  /** When the number may be reconnected again; null when it may now. */
  reconnectAfter: string | null;
}

/** How long a reconnect blocks the next one: it restarts the SIM. */
const RECONNECT_GAP_MS = 10 * 60_000;

async function lastReconnect(numberId: mongoose.Types.ObjectId): Promise<Date | null> {
  const row = await EsimProviderLog.findOne({ operation: "numbers.reconnect", ok: true, "request.number": String(numberId), createdAt: { $gte: new Date(Date.now() - RECONNECT_GAP_MS) } })
    .sort({ createdAt: -1 })
    .select({ createdAt: 1 })
    .lean<{ createdAt: Date } | null>();
  return row?.createdAt ?? null;
}

const reconnectAfter = (last: Date | null) => (last ? new Date(last.getTime() + RECONNECT_GAP_MS).toISOString() : null);

/** What the network last saw of the number. Null when it is not the shopper's. */
export async function numberDiagnostics(userId: string, numberId: string): Promise<NumberDiagnostics | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  const last = await lastReconnect(line.id);
  const tc = await gateway();
  if (!tc) return { activity: null, locations: null, session: undefined, reconnectAfter: reconnectAfter(last) };
  const [activity, locations, session] = await Promise.all([
    settled(() => tc.client.lastActivity(line.msisdn)),
    settled(() => tc.client.locationUpdates(line.msisdn)),
    (async () => {
      try {
        return await tc.client.dataSession(line.msisdn);
      } catch {
        return undefined;
      }
    })(),
  ]);
  return { activity, locations, session, reconnectAfter: reconnectAfter(last) };
}

export type ReconnectResult = { ok: true; reconnectAfter: string } | { ok: false; message: string; reconnectAfter?: string };

/**
 * Restarts the SIM so it registers on the network again; at most once every
 * ten minutes per number. Null when the number is not the shopper's.
 */
export async function reconnectNumber(userId: string, numberId: string): Promise<ReconnectResult | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  if (line.blocked) return { ok: false, message: "This number is blocked" };
  const last = await lastReconnect(line.id);
  if (last) return { ok: false, message: "The number was reconnected a few minutes ago; wait before trying again", reconnectAfter: reconnectAfter(last) ?? undefined };
  const tc = await gateway();
  if (!tc) return { ok: false, message: "Number services are not available right now" };
  try {
    await withProviderLog(
      { provider: tc.provider, providerCode: "topconnect", operation: "numbers.reconnect", request: { number: String(line.id) } },
      () => tc.client.reconnect(line.msisdn),
    );
    return { ok: true, reconnectAfter: new Date(Date.now() + RECONNECT_GAP_MS).toISOString() };
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
}

// ── daily data spending limit, and vouchers ──────────────────────────────

/** Smallest and largest daily data limit, in cents of the card's currency (as other number shops allow). */
export const DATA_LIMIT_MIN_MINOR = 10;
export const DATA_LIMIT_MAX_MINOR = 100_00;

export type DataLimitView = { limit: TopConnectDataLimit | null } | { unavailable: true };

/** The number's daily data spending limit. Null when the number is not the shopper's. */
export async function numberDataLimit(userId: string, numberId: string): Promise<DataLimitView | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  const tc = await gateway();
  if (!tc) return { unavailable: true };
  try {
    return { limit: await tc.client.dataLimit(line.msisdn) };
  } catch {
    return { unavailable: true };
  }
}

export type DataLimitChange = { ok: true; limit: TopConnectDataLimit | null } | { ok: false; message: string };

/**
 * Sets the number's repeating daily data spending limit (cents), or removes
 * it with null. TopConnect counts each 24 hours from when it was set, and it
 * may let a session run past it. Null when the number is not the shopper's.
 */
export async function setNumberDataLimit(userId: string, numberId: string, valueMinor: number | null): Promise<DataLimitChange | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  if (line.blocked) return { ok: false, message: "This number is blocked" };
  if (valueMinor !== null && (!Number.isSafeInteger(valueMinor) || valueMinor < DATA_LIMIT_MIN_MINOR || valueMinor > DATA_LIMIT_MAX_MINOR)) {
    return { ok: false, message: "Enter a daily limit between 0.10 and 100" };
  }
  const tc = await gateway();
  if (!tc) return { ok: false, message: "Number services are not available right now" };
  try {
    const limit = await withProviderLog(
      { provider: tc.provider, providerCode: "topconnect", operation: "numbers.data-limit", request: { number: String(line.id), valueMinor } },
      () => tc.client.setDataLimit(line.msisdn, valueMinor),
    );
    return { ok: true, limit };
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
}

/** Wrong voucher PINs a number may try in an hour: PINs must not be guessable by trying. */
const VOUCHER_TRIES_PER_HOUR = 5;

export type VoucherResult = { ok: true } | { ok: false; message: string };

/** Puts a TopConnect recharge voucher on the number. Null when the number is not the shopper's. */
export async function redeemNumberVoucher(userId: string, numberId: string, pin: string): Promise<VoucherResult | null> {
  const line = await ownedLine(userId, numberId);
  if (!line) return null;
  if (line.blocked) return { ok: false, message: "This number is blocked" };
  const failures = await EsimProviderLog.countDocuments({
    operation: "numbers.voucher",
    ok: false,
    "request.number": String(line.id),
    createdAt: { $gte: new Date(Date.now() - 60 * 60_000) },
  });
  if (failures >= VOUCHER_TRIES_PER_HOUR) return { ok: false, message: "Too many wrong codes; try again in an hour" };
  const tc = await gateway();
  if (!tc) return { ok: false, message: "Number services are not available right now" };
  try {
    // The PIN itself is never logged.
    await withProviderLog(
      { provider: tc.provider, providerCode: "topconnect", operation: "numbers.voucher", request: { number: String(line.id), pinEnd: pin.replace(/\D/g, "").slice(-4) } },
      () => tc.client.redeemVoucher(line.msisdn, pin),
    );
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
  await refreshNumberCard(String(line.id), { force: true }).catch(() => false);
  return { ok: true };
}
