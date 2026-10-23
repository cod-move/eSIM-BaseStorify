import type { NotificationItem } from '@/contracts/mobile/shop/v1';

/** The day groups of the inbox, newest first. */
export type NotificationGroup = 'today' | 'yesterday' | 'week' | 'earlier';

/**
 * A notification in its group's card. The first of a card carries the
 * group's heading above it, so the list has one row per notification.
 */
export type NotificationRow = {
  item: NotificationItem;
  group: NotificationGroup;
  /** The first of its group's card: the heading above it, and the card's top corners. */
  first: boolean;
  /** The last of its group's card: the bottom corners, and no line under it. */
  last: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `date`'s day to `now`'s, by the phone's calendar: 0 today, 1 yesterday. */
function daysBefore(date: Date, now: Date): number {
  const midnight = (value: Date) => new Date(value).setHours(0, 0, 0, 0);
  // Rounded: a day with a clock change is 23 or 25 hours long.
  return Math.round((midnight(now) - midnight(date)) / DAY_MS);
}

/**
 * The group a moment falls in: today, yesterday, the five days before, or
 * earlier. A moment a little ahead of the phone's clock is today's; one that
 * is not a date is earlier.
 */
export function groupOf(iso: string, now: Date): NotificationGroup {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'earlier';
  const days = daysBefore(date, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'earlier';
}

/**
 * The inbox's rows: the notifications in the order the store sent them (the
 * newest first), each with its day group and its place in the group's card.
 */
export function notificationRows(items: readonly NotificationItem[], now: Date): NotificationRow[] {
  // Runs of the same group, in the store's order.
  const runs: { group: NotificationGroup; items: NotificationItem[] }[] = [];
  for (const item of items) {
    const group = groupOf(item.createdAt, now);
    const run = runs.at(-1);
    if (run?.group === group) run.items.push(item);
    else runs.push({ group, items: [item] });
  }
  return runs.flatMap(({ group, items: card }) =>
    card.map((item, index) => ({
      item,
      group,
      first: index === 0,
      last: index === card.length - 1,
    }))
  );
}
