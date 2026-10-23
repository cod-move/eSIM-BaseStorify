import type { NotificationListQuery } from '@/contracts/mobile/biz/v1';

export const notificationsKeys = {
  /** The operator's notifications, a page at a time, one list per filter. */
  notifications: (locale: string, query: Omit<NotificationListQuery, 'cursor' | 'limit'>) =>
    ['private', 'account', 'notifications', locale, query] as const,
};
