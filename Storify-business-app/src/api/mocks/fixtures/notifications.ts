/**
 * The operators' notifications, the same as the dashboard's bell. Their links
 * are dashboard paths, with the locale in front, as the store writes them.
 */
import type { NotificationItem } from '@/contracts/mobile/biz/v1';

import { daysAgo, hoursAgo, minutesAgo } from './shared';

/** Notifications of the store's own operators (administrators, the store's staff). */
const PLATFORM: NotificationItem[] = [
  {
    id: 'ntf_p1',
    type: 'order_placed',
    title: 'New order #1042',
    message: 'Karim Uddin placed an order of 3 items.',
    link: '/en/admin/orders/ord_1042',
    read: false,
    createdAt: minutesAgo(12),
  },
  {
    id: 'ntf_p2',
    type: 'chat_message',
    title: 'New message',
    message: 'Rina Begum: Is the ceramic vase still available?',
    link: '/en/admin/inbox?view=chat&conversation=conv_store_1',
    read: false,
    createdAt: minutesAgo(40),
  },
  {
    id: 'ntf_p3',
    type: 'vendor_application',
    title: 'New Vendor Application Pending',
    message: 'Sunrise Bakery applied to open a shop.',
    link: '/en/admin/vendors/vendor_sunrise',
    read: false,
    createdAt: hoursAgo(5),
  },
  {
    id: 'ntf_p4',
    type: 'order_status',
    title: 'Order #1031 delivered',
    message: 'The courier marked order #1031 delivered.',
    link: '/en/admin/orders/ord_1031',
    read: true,
    createdAt: daysAgo(2),
  },
  // Opens the native return queue when the operator has VIEW_RETURNS.
  {
    id: 'ntf_p5',
    type: 'return_requested',
    title: 'Return requested',
    message: 'Karim Uddin asked to return an item of order #1031.',
    link: '/en/admin/returns',
    read: true,
    createdAt: daysAgo(3),
  },
];

/** Notifications of a seller and their staff. */
const SELLER: NotificationItem[] = [
  {
    id: 'ntf_v1',
    type: 'order_placed',
    title: 'New order #1042',
    message: 'You have a new order to fulfil.',
    link: '/en/vendor/orders/ord_1042',
    read: false,
    createdAt: minutesAgo(12),
  },
  {
    id: 'ntf_v2',
    type: 'product_low_stock',
    title: 'Low Stock Alert',
    message: 'Linen tea towel (set of 2) has 3 left.',
    link: '/en/vendor/products',
    read: false,
    createdAt: hoursAgo(3),
  },
  {
    id: 'ntf_v3',
    type: 'chat_message',
    title: 'New message',
    message: 'Omar Faruk: Can I change the delivery address?',
    link: '/en/vendor/inbox?conversation=conv_green_1',
    read: true,
    createdAt: daysAgo(1),
  },
  {
    id: 'ntf_v4',
    type: 'payouts',
    title: 'Payout sent',
    message: 'Payout PO-2026-0007 is on its way.',
    link: '/en/vendor/payouts/pay_7',
    read: true,
    createdAt: daysAgo(4),
  },
];

/** The notifications an account starts with, newest first. */
export function notificationsFor(workspaces: readonly string[]): NotificationItem[] {
  return [
    ...(workspaces.includes('platform') ? PLATFORM : []),
    ...(workspaces.includes('vendor') ? SELLER : []),
  ]
    .map((item) => ({ ...item }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
