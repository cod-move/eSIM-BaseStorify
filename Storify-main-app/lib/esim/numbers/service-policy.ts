/**
 * Rules for a number card's services (lib/esim/numbers/services.ts). Pure,
 * so the page, the routes and the tests agree.
 */

/**
 * Any number with its country code may take forwarded calls: TopConnect sets
 * no limit (its manual forwards to +55 and +380). Forwarded calls are paid
 * from the card's credit at TopConnect's rates.
 */
export function forwardingAllowed(digits: string): boolean {
  return /^[1-9]\d{5,14}$/.test(digits);
}

/**
 * SIM software versions TopConnect lets reconnect to the network (manual
 * 6.1.1): 7.5, 7.5M, 8K, 8KO and Telia postpaid. The manual writes some with
 * Cyrillic letters (М, К, О), so those count as their Latin twins.
 */
const RECONNECT_VERSIONS = new Set(["7.5", "7.5M", "8K", "8KO", "TELIA POSTPAID"]);

/** Whether a SIM may be reconnected; null when its version is not known. */
export function reconnectSupported(softwareVersion: string | null | undefined): boolean | null {
  if (!softwareVersion?.trim()) return null;
  const latin = softwareVersion.trim().toUpperCase().replace(/К/g, "K").replace(/М/g, "M").replace(/О/g, "O").replace(/\s+/g, " ");
  return RECONNECT_VERSIONS.has(latin);
}

/** How far back the history goes. */
export const HISTORY_DAYS = [7, 30, 90] as const;
export type HistoryDays = (typeof HISTORY_DAYS)[number];

export const isHistoryDays = (value: number): value is HistoryDays => (HISTORY_DAYS as readonly number[]).includes(value);

const ymd = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The days TopConnect is asked for (YYYY-MM-DD, UTC): from `days` ago up to
 * and including today — the gateway's `finished` day is exclusive, so it is
 * tomorrow.
 */
export function historyWindow(days: number, now: Date): { from: string; to: string } {
  const day = 86_400_000;
  return { from: ymd(new Date(now.getTime() - days * day)), to: ymd(new Date(now.getTime() + day)) };
}

/** Session traffic as the gateway counts it, in bytes: "20 KB", "34.5 MB", "1.2 GB". */
export function formatTraffic(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Call length: "2:05", "1:02:10". */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.round(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Most months one statement covers. */
export const STATEMENT_MAX_MONTHS = 12;

export interface StatementMonth {
  /** "2026-10". */
  month: string;
  /** First day, and the first day of the next month (TopConnect's `finished` is exclusive). */
  from: string;
  to: string;
}

/**
 * The whole months a statement covers, "YYYY-MM" to "YYYY-MM": completed
 * months only (UTC), at most twelve, oldest first. A string says what is
 * wrong.
 */
export function statementMonths(from: string, to: string, now: Date): StatementMonth[] | string {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return null;
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? Number(match[1]) * 12 + (month - 1) : null;
  };
  const start = parse(from);
  const end = parse(to);
  if (start === null || end === null) return "Choose the months";
  if (end < start) return "The last month is before the first";
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  if (end >= current) return "Only completed months can be included";
  if (end - start + 1 > STATEMENT_MAX_MONTHS) return `At most ${STATEMENT_MAX_MONTHS} months at a time`;
  const label = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  const months: StatementMonth[] = [];
  for (let index = start; index <= end; index += 1) months.push({ month: label(index), from: `${label(index)}-01`, to: `${label(index + 1)}-01` });
  return months;
}

/** Totals for the history's summary line. */
export function historyTotals(
  calls: ReadonlyArray<{ kind: "call" | "sms" | "voicemail"; costMinor: number | null }> | null,
  data: ReadonlyArray<{ bytes: number | null; costMinor: number | null }> | null,
): { calls: number; texts: number; dataSessions: number; dataBytes: number; costMinor: number } {
  const list = calls ?? [];
  const sessions = data ?? [];
  return {
    calls: list.filter((entry) => entry.kind === "call").length,
    texts: list.filter((entry) => entry.kind === "sms").length,
    dataSessions: sessions.length,
    dataBytes: sessions.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
    costMinor: [...list, ...sessions].reduce((sum, entry) => sum + (entry.costMinor ?? 0), 0),
  };
}
