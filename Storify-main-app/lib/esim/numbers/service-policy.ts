/**
 * Rules for a number card's services (lib/esim/numbers/services.ts). Pure,
 * so the page, the routes and the tests agree.
 */

/**
 * Calls may be forwarded only to North America (+1) and Europe (+3, +4), as
 * other number shops allow: forwarded calls are paid from the card's credit,
 * and these are the cheap destinations.
 */
export const FORWARD_PREFIXES = ["1", "3", "4"] as const;

export function forwardingAllowed(digits: string): boolean {
  return /^\d{6,15}$/.test(digits) && FORWARD_PREFIXES.some((prefix) => digits.startsWith(prefix));
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

/** Totals for the history's summary line. */
export function historyTotals(
  calls: ReadonlyArray<{ kind: "call" | "sms"; costMinor: number | null }> | null,
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
