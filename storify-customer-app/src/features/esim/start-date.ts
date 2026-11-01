/**
 * The start date of a plan that takes one (ORD-03), as days counted on from
 * the earliest the store allows. Dates are UTC calendar days, YYYY-MM-DD, the
 * way the store sends and takes them. Pure.
 */

const DAY_MS = 86_400_000;
const time = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** The day `offset` days after `day`. */
export function addDays(day: string, offset: number): string {
  return new Date(time(day) + offset * DAY_MS).toISOString().slice(0, 10);
}

/** How many days `to` is after `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((time(to) - time(from)) / DAY_MS);
}

/** A day as the shopper reads it, in their language: "Tue, 10 Nov". */
export function readableDay(day: string, locale: string): string {
  return new Date(time(day)).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
