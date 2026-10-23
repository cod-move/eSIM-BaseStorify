/** GET /notifications and PATCH /notifications: the operator's own, whatever the workspace. */
import { notificationsFor } from '../fixtures/notifications';
import { flag, pageOf } from '../fixtures/shared';
import { accountOf, bodyOf, invalid, type MockContext, type MockRoute } from '../kit';
import type { NotificationItem } from '@/contracts/mobile/biz/v1';

/** Each account's notifications, made from the fixtures the first time they are asked for. */
const held = new Map<string, NotificationItem[]>();
/** The most ids one request may mark, as the contract's schema says. */
const IDS_MAX = 100;

export function reset(): void {
  held.clear();
}

function listOf(ctx: MockContext): NotificationItem[] {
  const account = accountOf(ctx);
  let list = held.get(account.id);
  if (!list) {
    list = notificationsFor(account.grants.map((grant) => grant.workspace));
    held.set(account.id, list);
  }
  return list;
}

function unread(list: readonly NotificationItem[]): number {
  return list.filter((item) => !item.read).length;
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/notifications',
    access: 'account',
    handle: (ctx) => {
      const list = listOf(ctx);
      const rows = flag(ctx.query, 'unreadOnly') ? list.filter((item) => !item.read) : list;
      return { ...pageOf(rows, ctx.query), unreadCount: unread(list) };
    },
  },
  {
    method: 'PATCH',
    path: '/notifications',
    access: 'account',
    handle: (ctx) => {
      const body = bodyOf(ctx);
      const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string') : [];
      if (Array.isArray(body.ids) && body.ids.length > IDS_MAX) {
        throw invalid('ids', `Send up to ${IDS_MAX} ids at a time`);
      }
      if (body.all !== true && ids.length === 0) throw invalid('ids', 'Send ids, or all: true');
      const list = listOf(ctx);
      for (const item of list) {
        if (body.all === true || ids.includes(item.id)) item.read = true;
      }
      return { unreadCount: unread(list) };
    },
  },
];
