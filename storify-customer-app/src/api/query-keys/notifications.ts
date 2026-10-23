import type { NotificationListQuery } from '@/contracts/mobile/shop/v1';

export const notificationsKeys = {
  /** The shopper's notifications: every list of them, to ask again after marking some read. */
  notifications: (locale: string) => ['private', locale, 'notifications'] as const,
  /** One list of them, a page at a time: all, or the unread ones. */
  notificationList: (locale: string, query: Omit<NotificationListQuery, 'cursor' | 'limit'>) =>
    ['private', locale, 'notifications', query] as const,
};
