/**
 * The mock store's data for: notifications. Every mock shopper has the same
 * ones, dated back from the moment the store starts (or is reset), so the
 * inbox always has today's, yesterday's, the week's and older ones.
 */
import type { NotificationItem } from '@/contracts/mobile/shop/v1';

type NotificationSeed = Omit<NotificationItem, 'link' | 'read' | 'createdAt'> & {
  /** The web path without the locale; the store puts the locale in front. */
  path?: string;
  read: boolean;
  /** How long ago it came. */
  minutesAgo: number;
};

type Notification = Omit<NotificationSeed, 'minutesAgo'> & { createdAt: string };

const HOUR = 60;
const DAY = 24 * HOUR;

const SEED_NOTIFICATIONS: NotificationSeed[] = [
  {
    id: 'ntf_6',
    type: 'order_status',
    title: 'Order #1005 is on its way',
    message: 'Your parcel left the warehouse with Swift Parcel.',
    path: '/account/orders/ord_1005',
    read: false,
    minutesAgo: 25,
  },
  {
    id: 'ntf_7',
    type: 'chat_message',
    title: 'New chat reply',
    message: 'Urban Loft: Yes, the sage tee is back in size L.',
    path: '/account/inbox',
    read: true,
    minutesAgo: 3 * HOUR,
  },
  {
    id: 'ntf_5',
    type: 'order_placed',
    title: 'Order #1006 received',
    message: 'We have your order and will let you know when it ships.',
    path: '/account/orders/ord_1006',
    read: false,
    minutesAgo: DAY + 2 * HOUR,
  },
  {
    id: 'ntf_4',
    type: 'order_delivered',
    title: 'Part of order #1004 was delivered',
    message: 'North Trail delivered its part. Urban Loft is still preparing yours.',
    path: '/account/orders/ord_1004',
    read: true,
    minutesAgo: 3 * DAY,
  },
  {
    id: 'ntf_3',
    type: 'store_credit',
    title: 'You have store credit',
    message: 'The refund for order #1002 was added to your store credit.',
    read: true,
    minutesAgo: 20 * DAY,
  },
];

function seed(): Notification[] {
  const now = Date.now();
  return SEED_NOTIFICATIONS.map(({ minutesAgo, ...item }) => ({
    ...item,
    createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
  }));
}

let notifications = seed();

export function resetNotifications(): void {
  notifications = seed();
}

/** Newest first, as the store lists them. */
export function listNotifications(): Notification[] {
  return [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadCount(): number {
  return notifications.filter((item) => !item.read).length;
}

/** Marks these read, or every one; ids that are not there are skipped. */
export function markRead(ids: readonly string[] | 'all'): void {
  for (const item of notifications) {
    if (ids === 'all' || ids.includes(item.id)) item.read = true;
  }
}

export function toItem(notification: Notification, locale: string): NotificationItem {
  const { path, ...item } = notification;
  return { ...item, link: path ? `/${locale}${path}` : undefined };
}
