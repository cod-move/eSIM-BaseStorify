/**
 * Calendar months, in UTC, as the one thing anybody closes.
 *
 * UTC throughout, like every other dated figure in finance: a month boundary
 * that moved with the server's timezone would include or exclude a day's
 * takings depending on where the box happens to be.
 *
 * Gathered here because the same three sums were being written in the close
 * API, the panel that calls it and the screen around them — and a month whose
 * last instant differs by a millisecond between two of those is a month whose
 * figures differ between the preview and the snapshot.
 *
 * [esim-patch] P82 months are the store's calendar months (Asia/Singapore by
 * default, lib/esim/time/store-zone.ts), not UTC ones.
 */

import { fromStoreWall, toStoreWall } from "@/lib/esim/time/store-zone"; // [esim-patch] P82

/** "2026-07" — the label a closed period is stored and found under. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** First and last instant of a "YYYY-MM", inclusive. */
export function monthBounds(month: string): { from: Date; to: Date } {
  const [year, monthIndex] = month.split("-").map(Number);
  const from = fromStoreWall(Date.UTC(year, monthIndex - 1, 1, 0, 0, 0, 0)); // [esim-patch] P82
  const to = new Date(fromStoreWall(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)).getTime() - 1);
  return { from, to };
}

/**
 * The finished months a store could still be closing, newest first.
 *
 * Three years rather than one. Twelve months assumed the store had been closing
 * as it went; one that has never closed anything — which is every store until
 * the day it starts — could not reach the year it actually needs to file, and
 * nothing on the screen said why the month was missing.
 */
export function closableMonths(now: Date, count = 36): string[] {
  const months: string[] = [];
  const today = toStoreWall(now); // [esim-patch] P82 the cursor walks the store's calendar
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  for (let i = 0; i < count; i += 1) {
    // Step back first: the current month is not finished, and closing it would
    // date the rest of its own days into the next one.
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    months.push(monthKey(cursor));
  }
  return months;
}

/** "July 2026" — a month said the way a person would say it. */
export function formatMonthLabel(month: string, locale: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthIndex - 1, 1)); // [esim-patch] P82 the month itself, not its instant
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(from);
}
