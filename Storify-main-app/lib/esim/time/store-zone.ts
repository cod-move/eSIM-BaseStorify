/**
 * The store's time zone: where the admin's "today", "this month" and every
 * day or month bucket begin (dashboard, analytics, list date filters,
 * finance reports, eSIM reports). Storify drew those lines at UTC midnight,
 * so an order placed in Singapore before 08:00 counted on the day before.
 *
 * `NEXT_PUBLIC_STORE_TIME_ZONE` (an IANA name) overrides the default; it is
 * public so the admin's charts, in the browser, label buckets the same way
 * the server cut them. Mongo's date operators take the same name
 * (`timezone: STORE_TIME_ZONE`).
 *
 * Runtime-free. The trick used throughout is the "wall clock" Date: the
 * store's local time written into a Date's UTC fields. Code that did day and
 * month arithmetic with UTC getters keeps doing exactly that on a wall-clock
 * Date, and `fromStoreWall` turns the result back into the real instant.
 */

export const DEFAULT_STORE_TIME_ZONE = "Asia/Singapore";

function validZone(value: string | undefined): string | null {
  const zone = value?.trim();
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

export const STORE_TIME_ZONE: string =
  validZone(process.env.NEXT_PUBLIC_STORE_TIME_ZONE) ?? DEFAULT_STORE_TIME_ZONE;

const DAY_MS = 24 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** How far the zone's clock is ahead of UTC at `at`, in ms (Singapore: +8 h). */
export function storeOffsetMs(at: Date | number, zone: string = STORE_TIME_ZONE): number {
  const time = typeof at === "number" ? at : at.getTime();
  const parts: Record<string, number> = {};
  for (const part of formatterFor(zone).formatToParts(new Date(time))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const whole = time - (time % 1000 + 1000) % 1000;
  return wall - whole;
}

/** The store's local time of `date`, in a Date's UTC fields. */
export function toStoreWall(date: Date | number, zone: string = STORE_TIME_ZONE): Date {
  const time = typeof date === "number" ? date : date.getTime();
  return new Date(time + storeOffsetMs(time, zone));
}

/** The instant a wall-clock Date (local time in UTC fields) stands for. */
export function fromStoreWall(wall: Date | number, zone: string = STORE_TIME_ZONE): Date {
  const time = typeof wall === "number" ? wall : wall.getTime();
  // Two passes settle the offset on either side of a daylight-saving change.
  let instant = time - storeOffsetMs(time, zone);
  instant = time - storeOffsetMs(instant, zone);
  return new Date(instant);
}

/** The instant the store's day containing `date` began. */
export function storeDayStart(date: Date | number, zone: string = STORE_TIME_ZONE): Date {
  const wall = toStoreWall(date, zone);
  return fromStoreWall(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()), zone);
}

/** The instant the store's month containing `date` began, moved `addMonths` months. */
export function storeMonthStart(date: Date | number, addMonths = 0, zone: string = STORE_TIME_ZONE): Date {
  const wall = toStoreWall(date, zone);
  return fromStoreWall(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + addMonths, 1), zone);
}

/** "2026-11-23", the store's date of `date`. */
export function storeDayString(date: Date | number, zone: string = STORE_TIME_ZONE): string {
  return toStoreWall(date, zone).toISOString().slice(0, 10);
}

/** Midnight in the store at the start of "2026-11-23", or null for anything that is not a real day. */
export function storeDay(day: string, zone: string = STORE_TIME_ZONE): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const wall = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(wall.getTime()) || wall.toISOString().slice(0, 10) !== day) return null;
  return fromStoreWall(wall, zone);
}

/** The last instant of the store day that begins at `dayStart`. */
export function storeDayEnd(dayStart: Date, zone: string = STORE_TIME_ZONE): Date {
  const wall = toStoreWall(dayStart, zone);
  return new Date(fromStoreWall(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1), zone).getTime() - 1);
}

/** `n` store days after the day beginning at `dayStart` (negative for before). */
export function addStoreDays(dayStart: Date, n: number, zone: string = STORE_TIME_ZONE): Date {
  const wall = toStoreWall(dayStart, zone);
  return fromStoreWall(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + n), zone);
}

export const STORE_DAY_MS = DAY_MS;
