import type { IconName } from '@/components/ui/icon';
import type { StatusTone } from '@/components/ui/status-chip';
import type { NotificationItem } from '@/contracts/mobile/biz/v1';
import { daysBefore } from '@/i18n/use-list-time';

/** The day groups of the notifications, newest first. */
export type NotificationGroup = 'today' | 'yesterday' | 'week' | 'earlier';

/**
 * A notification in its group's card. The first of a card carries the
 * group's heading above it, so the list has one row per notification.
 */
export type NotificationRow = {
  item: NotificationItem;
  group: NotificationGroup;
  /** Its place in its group's card, for `GroupedItem`: 0 has the heading. */
  index: number;
  /** How many the card holds now. */
  count: number;
};

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
 * The list's rows: the notifications in the order the
 * store sent them (the newest first), each with its day group and its place
 * in the group's card.
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
    card.map((item, index) => ({ item, group, index, count: card.length }))
  );
}

/**
 * What a notification is about, by the store's word for it (`order_placed`,
 * `chat_message`, `product_low_stock` …): its icon, and the tone of the circle
 * behind it. `success` for money in and a delivery, `warning` for something
 * to act on (low stock, a return, a quote), `info` for news; a word the app
 * does not know is a grey bell.
 */
export function notificationKind(type: string): { icon: IconName; tone: StatusTone } {
  const kind = type.toLowerCase();
  if (kind.includes('stock')) return { icon: 'boxes', tone: 'warning' };
  if (kind.includes('return')) return { icon: 'return', tone: 'warning' };
  if (kind.includes('quote')) return { icon: 'tag', tone: 'warning' };
  if (kind.includes('payout') || kind.includes('payment')) {
    return { icon: 'wallet', tone: 'success' };
  }
  if (kind.includes('delivered')) return { icon: 'delivered', tone: 'success' };
  if (kind.includes('vendor') || kind.includes('application')) {
    return { icon: 'file-text', tone: 'info' };
  }
  if (kind.includes('chat') || kind.includes('message')) return { icon: 'chat', tone: 'info' };
  if (kind.includes('review')) return { icon: 'star', tone: 'info' };
  if (kind.includes('boost')) return { icon: 'chart', tone: 'info' };
  if (kind.includes('order') || kind.includes('consignment')) {
    return { icon: 'package', tone: 'info' };
  }
  return { icon: 'bell', tone: 'neutral' };
}
