/** Endpoints: the operator's notifications, the same as the dashboard's bell. */
import {
  NotificationList,
  NotificationsReadResult,
  type MarkNotificationsReadRequest,
  type NotificationListQuery,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** GET /notifications: a page, newest first, with the unread count of all. */
export function getNotifications(
  locale: string,
  query: NotificationListQuery,
  { etag, signal }: Conditional
) {
  return api.request({ locale, path: '/notifications', query, etag, signal }, NotificationList);
}

/** PATCH /notifications: marks some, or every one, read. It cannot mark one unread. */
export function markNotificationsRead(locale: string, body: MarkNotificationsReadRequest) {
  return api.data(
    { locale, path: '/notifications', method: 'PATCH', body },
    NotificationsReadResult
  );
}
