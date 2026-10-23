import type { NotificationItem } from '@/contracts/mobile/biz/v1';

import { groupOf, notificationKind, notificationRows } from '../notification-rows';

// Thursday 8 October 2026, 10:00 on the phone's clock.
const NOW = new Date(2026, 9, 8, 10, 0);

const at = (days: number, hour = 9) => new Date(2026, 9, 8 - days, hour).toISOString();

function notification(id: string, createdAt: string): NotificationItem {
  return { id, type: 'order_placed', title: id, message: '', read: false, createdAt };
}

describe('groupOf', () => {
  it('goes by the calendar day, not by 24 hours', () => {
    expect(groupOf(at(0, 0), NOW)).toBe('today');
    expect(groupOf(at(1, 23), NOW)).toBe('yesterday');
    expect(groupOf(at(1, 0), NOW)).toBe('yesterday');
    expect(groupOf(at(2), NOW)).toBe('week');
    expect(groupOf(at(6), NOW)).toBe('week');
    expect(groupOf(at(7), NOW)).toBe('earlier');
  });

  it('counts a moment a little ahead of the phone’s clock as today, and a non-date as earlier', () => {
    expect(groupOf(new Date(2026, 9, 8, 10, 1).toISOString(), NOW)).toBe('today');
    expect(groupOf('not a date', NOW)).toBe('earlier');
  });
});

describe('notificationRows', () => {
  it('keeps the store’s order and gives each its group and its place in the group’s card', () => {
    const rows = notificationRows(
      [
        notification('a', at(0)),
        notification('b', at(0, 8)),
        notification('c', at(1)),
        notification('d', at(10)),
      ],
      NOW
    );

    expect(rows.map((row) => `${row.item.id} ${row.group} ${row.index + 1}/${row.count}`)).toEqual([
      'a today 1/2',
      'b today 2/2',
      'c yesterday 1/1',
      'd earlier 1/1',
    ]);
  });

  it('is empty for no notifications', () => {
    expect(notificationRows([], NOW)).toEqual([]);
  });
});

describe('notificationKind', () => {
  it('knows the store’s words, and draws a bell for any other', () => {
    expect(notificationKind('order_placed')).toEqual({ icon: 'package', tone: 'info' });
    expect(notificationKind('chat_message')).toEqual({ icon: 'chat', tone: 'info' });
    expect(notificationKind('product_low_stock')).toEqual({ icon: 'boxes', tone: 'warning' });
    expect(notificationKind('return_requested')).toEqual({ icon: 'return', tone: 'warning' });
    expect(notificationKind('payouts')).toEqual({ icon: 'wallet', tone: 'success' });
    expect(notificationKind('vendor_application')).toEqual({ icon: 'file-text', tone: 'info' });
    expect(notificationKind('system')).toEqual({ icon: 'bell', tone: 'neutral' });
  });
});
