import {
  EsimNumberActionResult,
  EsimNumberDataLimit,
  EsimNumberDataLimitRequest,
  EsimNumberDiagnostics,
  EsimNumberForward,
  EsimNumberForwardRequest,
  EsimNumberHistory,
  EsimNumberHistoryQuery,
  EsimNumberReconnect,
  EsimNumberRefreshRequest,
  EsimNumberServices,
  EsimNumberSmsRequest,
  EsimNumberSwitchRequest,
  EsimNumberSwitchResult,
  EsimNumberTransferRequest,
} from "@/contracts/mobile/shop/v1/esim";
import { defineRoute } from "@/lib/api-core/registry";
import { connectDB, mongoose } from "@/lib/db";
import { requestCardTransfer, sendSmsToOwnNumber } from "@/lib/esim/numbers/card-tools";
import { formatSeconds, formatTraffic, historyTotals, isHistoryDays } from "@/lib/esim/numbers/service-policy";
import {
  DATA_LIMIT_MAX_MINOR,
  DATA_LIMIT_MIN_MINOR,
  numberDataLimit,
  numberDiagnostics,
  numberHistory,
  numberServices,
  reconnectNumber,
  setNumberDataLimit,
  setNumberForwarding,
  setNumberSwitch,
} from "@/lib/esim/numbers/services";
import type { TopConnectDataLimit } from "@/lib/esim/providers/topconnect";
import { SMS_MAX_CHARS } from "@/lib/esim/providers/topconnect";
import { EsimNumber } from "@/models/esim-number.model";
import { cardMoney, iso } from "./number-dto";
import { NUMBER_REASONS, numberNotFound, numberRefused } from "./number-refusals";

/**
 * A number's services, history and diagnostics in the shopper app: the
 * website's own calls to TopConnect (lib/esim/numbers/services.ts,
 * card-tools.ts), for the shopper's own sold number only, each change
 * written to the provider log there. Read from TopConnect as asked, never
 * cached.
 */

/** The card's currency, for amounts TopConnect sends without one. */
async function cardCurrency(numberId: string): Promise<string> {
  if (!mongoose.isValidObjectId(numberId)) return "EUR";
  const row = await EsimNumber.findById(numberId).select({ "card.currency": 1 }).lean<{ card?: { currency?: string | null } | null }>();
  return row?.card?.currency ?? "EUR";
}

const money = (minor: number | null | undefined, currency: string | null | undefined, fallback: string) =>
  minor === null || minor === undefined ? undefined : cardMoney(minor, currency ?? fallback);


/** GET /me/esim-numbers/{id}/services */
export const myNumberServicesRoute = defineRoute({
  id: "me.esim-numbers.services",
  method: "GET",
  path: "/me/esim-numbers/{id}/services",
  auth: "user",
  cache: { kind: "private" },
  output: EsimNumberServices,
  rateLimit: { bucket: "esim:number:services", preset: "browse" },
  handler: async ({ session, params }) => {
    await connectDB();
    const services = await numberServices(session.user.id, params.id);
    if (!services) throw numberNotFound();
    return {
      data: services.data,
      sms: services.sms,
      voice: services.voice,
      voicemail: services.voicemail,
      ...(services.forwardTo !== undefined ? { forwardTo: services.forwardTo } : {}),
      forwardKnown: services.forwardTo !== undefined,
      blocked: services.blocked,
    };
  },
});

/** POST /me/esim-numbers/{id}/services: one service on or off (data may only be turned on). */
export const setMyNumberServiceRoute = defineRoute({
  id: "me.esim-numbers.services.set",
  method: "POST",
  path: "/me/esim-numbers/{id}/services",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberSwitchRequest,
  output: EsimNumberSwitchResult,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:service-change", preset: "moderate" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await setNumberSwitch(session.user.id, params.id, input.service, input.on);
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { service: input.service, on: result.on };
  },
});

/** POST /me/esim-numbers/{id}/forward: every call to another number, or (`to: null`) none. */
export const forwardMyNumberRoute = defineRoute({
  id: "me.esim-numbers.forward",
  method: "POST",
  path: "/me/esim-numbers/{id}/forward",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberForwardRequest,
  output: EsimNumberForward,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:forward", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await setNumberForwarding(session.user.id, params.id, input.to ? input.to : null);
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { forwardTo: result.forwardTo };
  },
});

function limitView(limit: TopConnectDataLimit | null, currency: string, known: boolean) {
  return {
    known,
    limit: limit
      ? {
          ...(limit.valueMinor !== null ? { value: cardMoney(limit.valueMinor, currency), valueMinor: limit.valueMinor } : {}),
          ...(limit.usedMinor !== null ? { used: cardMoney(limit.usedMinor, currency) } : {}),
          ...(limit.periodEnd ? { periodEnd: iso(limit.periodEnd) } : {}),
        }
      : null,
    minMinor: DATA_LIMIT_MIN_MINOR,
    maxMinor: DATA_LIMIT_MAX_MINOR,
  };
}

/** GET /me/esim-numbers/{id}/data-limit: the daily data spending limit (experimental, as TopConnect warns). */
export const myNumberDataLimitRoute = defineRoute({
  id: "me.esim-numbers.data-limit",
  method: "GET",
  path: "/me/esim-numbers/{id}/data-limit",
  auth: "user",
  cache: { kind: "private" },
  output: EsimNumberDataLimit,
  rateLimit: { bucket: "esim:number:data-limit", preset: "browse" },
  handler: async ({ session, params }) => {
    await connectDB();
    const [view, currency] = await Promise.all([numberDataLimit(session.user.id, params.id), cardCurrency(params.id)]);
    if (!view) throw numberNotFound();
    return "unavailable" in view ? limitView(null, currency, false) : limitView(view.limit, currency, true);
  },
});

/** POST /me/esim-numbers/{id}/data-limit: sets the limit (cents of the card currency) or removes it (null). */
export const setMyNumberDataLimitRoute = defineRoute({
  id: "me.esim-numbers.data-limit.set",
  method: "POST",
  path: "/me/esim-numbers/{id}/data-limit",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberDataLimitRequest,
  output: EsimNumberDataLimit,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:data-limit-change", preset: "moderate" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const [result, currency] = await Promise.all([setNumberDataLimit(session.user.id, params.id, input.valueMinor), cardCurrency(params.id)]);
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return limitView(result.limit, currency, true);
  },
});

/** GET /me/esim-numbers/{id}/history?days=7|30|90: calls, texts, data sessions, recharges and voicemail. */
export const myNumberHistoryRoute = defineRoute({
  id: "me.esim-numbers.history",
  method: "GET",
  path: "/me/esim-numbers/{id}/history",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberHistoryQuery,
  output: EsimNumberHistory,
  rateLimit: { bucket: "esim:number:history", preset: "browse" },
  handler: async ({ session, params, input }) => {
    const days = input.days !== undefined && isHistoryDays(input.days) ? input.days : 30;
    await connectDB();
    const [history, currency] = await Promise.all([numberHistory(session.user.id, params.id, days), cardCurrency(params.id)]);
    if (!history) throw numberNotFound();
    const totals = historyTotals(history.calls, history.data);
    return {
      days,
      totals: { calls: totals.calls, texts: totals.texts, data: formatTraffic(totals.dataBytes), cost: cardMoney(totals.costMinor, currency) },
      calls:
        history.calls?.map((entry) => {
          const party = entry.direction === "out" ? entry.to : entry.from;
          const cost = money(entry.costMinor, entry.currency, currency);
          return {
            kind: entry.kind,
            direction: entry.direction,
            ...(party ? { party } : {}),
            ...(entry.at ? { at: iso(entry.at) } : {}),
            ...(entry.kind === "call" ? { duration: formatSeconds(entry.seconds) } : {}),
            ...(entry.destination ? { destination: entry.destination } : {}),
            ...(cost ? { cost } : {}),
          };
        }) ?? null,
      data:
        history.data?.map((entry) => {
          const network = [entry.operator, entry.country].filter(Boolean).join(" · ");
          const cost = money(entry.costMinor, entry.currency, currency);
          return {
            ...(entry.at ? { at: iso(entry.at) } : {}),
            ...(network ? { network } : {}),
            traffic: formatTraffic(entry.bytes),
            ...(cost ? { cost } : {}),
          };
        }) ?? null,
      recharges:
        history.recharges?.map((entry) => {
          const amount = money(entry.amountMinor, entry.currency, currency);
          return {
            ...(entry.at ? { at: iso(entry.at) } : {}),
            kind: entry.kind,
            out: (entry.amountMinor ?? 0) < 0,
            ...(amount ? { amount } : {}),
          };
        }) ?? null,
      voicemails:
        history.voicemails?.map((entry) => ({ id: entry.id, ...(entry.at ? { at: iso(entry.at) } : {}), ...(entry.from ? { from: entry.from } : {}) })) ?? null,
    };
  },
});

/** GET /me/esim-numbers/{id}/diagnostics: what the network last saw of the number. */
export const myNumberDiagnosticsRoute = defineRoute({
  id: "me.esim-numbers.diagnostics",
  method: "GET",
  path: "/me/esim-numbers/{id}/diagnostics",
  auth: "user",
  cache: { kind: "private" },
  output: EsimNumberDiagnostics,
  rateLimit: { bucket: "esim:number:diagnostics", preset: "browse" },
  handler: async ({ session, params }) => {
    await connectDB();
    const [result, currency] = await Promise.all([numberDiagnostics(session.user.id, params.id), cardCurrency(params.id)]);
    if (!result) throw numberNotFound();
    const location = result.locations?.[0] ?? null;
    return {
      activity:
        result.activity?.map((entry) => {
          const detail = [
            entry.party ? `+${entry.party}` : null,
            entry.seconds !== null ? formatSeconds(entry.seconds) : null,
            entry.bytes !== null ? formatTraffic(entry.bytes) : null,
            [entry.operator, entry.country].filter(Boolean).join(" · ") || null,
          ]
            .filter(Boolean)
            .join(" · ");
          const cost = entry.costMinor ? cardMoney(entry.costMinor, entry.currency ?? currency) : undefined;
          return { type: entry.type, ...(entry.at ? { at: iso(entry.at) } : {}), ...(detail ? { detail } : {}), ...(cost ? { cost } : {}) };
        }) ?? null,
      ...(result.locations !== null
        ? {
            location: location
              ? {
                  ...(location.at ? { at: iso(location.at) } : {}),
                  network: `MCC/MNC ${location.mcc ?? "—"}/${location.mnc ?? "—"}${location.vlr ? ` · VLR ${location.vlr}` : ""}`,
                }
              : null,
          }
        : {}),
      locationKnown: result.locations !== null,
      ...(result.session !== undefined
        ? {
            session: result.session
              ? { ...(result.session.startedAt ? { startedAt: iso(result.session.startedAt) } : {}), ...(result.session.mccmnc ? { network: result.session.mccmnc } : {}) }
              : null,
          }
        : {}),
      sessionKnown: result.session !== undefined,
      ...(result.reconnectAfter ? { reconnectAfter: result.reconnectAfter } : {}),
      reconnectSupported: result.reconnectSupported,
    };
  },
});

/** POST /me/esim-numbers/{id}/reconnect: the SIM restarts and registers again (once in 10 minutes). */
export const reconnectMyNumberRoute = defineRoute({
  id: "me.esim-numbers.reconnect",
  method: "POST",
  path: "/me/esim-numbers/{id}/reconnect",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberRefreshRequest,
  output: EsimNumberReconnect,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:reconnect", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params }) => {
    await connectDB();
    const result = await reconnectNumber(session.user.id, params.id);
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { reconnectAfter: result.reconnectAfter };
  },
});

/** POST /me/esim-numbers/{id}/sms: a text message to the number itself, to check it receives. */
export const smsMyNumberRoute = defineRoute({
  id: "me.esim-numbers.sms",
  method: "POST",
  path: "/me/esim-numbers/{id}/sms",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberSmsRequest,
  output: EsimNumberActionResult,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:sms", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    if ([...input.message].length > SMS_MAX_CHARS) throw numberRefused(`A text message holds ${SMS_MAX_CHARS} characters`);
    await connectDB();
    const result = await sendSmsToOwnNumber(session.user.id, params.id, { from: input.from.replace(/^\+/, ""), message: input.message });
    if (result === null) throw numberNotFound();
    if (!result.sent) throw numberRefused(result.message ?? "The message could not be sent");
    return { state: "completed" };
  },
});

/** POST /me/esim-numbers/{id}/transfer: credit to another of the platform's numbers, once per `key`. */
export const transferFromMyNumberRoute = defineRoute({
  id: "me.esim-numbers.transfer",
  method: "POST",
  path: "/me/esim-numbers/{id}/transfer",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberTransferRequest,
  output: EsimNumberActionResult,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:transfer", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await requestCardTransfer(session.user.id, params.id, { toMsisdn: input.to, amountMinor: input.amountMinor, key: input.key });
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { state: result.state, ...(result.message ? { message: result.message } : {}) };
  },
});
