/** Endpoints: the shopper's notifications. */
import {
  NotificationList,
  NotificationsReadResult,
  type MarkNotificationsReadRequest,
  type NotificationListQuery,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';

/** A page of the shopper's notifications, newest first, with the unread count of all. */
export function getNotifications(
  locale: string,
  query: NotificationListQuery,
  signal: AbortSignal
) {
  return api.data(
    { locale, path: '/notifications', query, auth: 'user', signal },
    NotificationList
  );
}

/** Marks some notifications, or every one, read. It cannot mark one unread. */
export function markNotificationsRead(locale: string, body: MarkNotificationsReadRequest) {
  return api.data(
    { locale, path: '/notifications', method: 'PATCH', body, auth: 'user' },
    NotificationsReadResult
  );
}
