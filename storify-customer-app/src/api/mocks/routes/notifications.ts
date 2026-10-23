/** Notifications: the list and marking them read. */
import { MarkNotificationsReadRequest } from '@/contracts/mobile/shop/v1';

import {
  listNotifications,
  markRead,
  resetNotifications,
  toItem,
  unreadCount,
} from '../fixtures/notifications';
import { MockError, requireUser, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/notifications',
    handle: (ctx) => {
      requireUser(ctx);
      const offset = Number(ctx.query.get('cursor') ?? 0);
      if (!Number.isInteger(offset) || offset < 0) {
        throw new MockError(400, 'VALIDATION_ERROR', 'Unknown cursor');
      }
      const limit = Math.min(Math.max(Number(ctx.query.get('limit') ?? 20), 1), 40);
      const unreadOnly = ctx.query.get('unreadOnly') === 'true';
      const items = listNotifications().filter((item) => !unreadOnly || !item.read);
      return {
        items: items.slice(offset, offset + limit).map((item) => toItem(item, ctx.locale)),
        nextCursor: offset + limit < items.length ? String(offset + limit) : null,
        unreadCount: unreadCount(),
      };
    },
  },
  {
    method: 'PATCH',
    path: '/notifications',
    handle: (ctx) => {
      requireUser(ctx);
      const body = MarkNotificationsReadRequest.safeParse(ctx.body);
      if (!body.success || (!body.data.all && !body.data.ids?.length)) {
        throw new MockError(400, 'VALIDATION_ERROR', 'Send ids or all');
      }
      markRead(body.data.all ? 'all' : (body.data.ids ?? []));
      return { unreadCount: unreadCount() };
    },
  },
];

export const reset = resetNotifications;
