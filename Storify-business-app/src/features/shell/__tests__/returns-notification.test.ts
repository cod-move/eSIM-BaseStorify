import { NOTIFICATION_QUERIES, queryKeys } from '@/api/query-keys';
import { pushRefreshKeys } from '@/features/devices/push-refresh';
import { notificationTarget, notificationWorkspace } from '@/lib/links';
import { targetRoute } from '../notification-routes';
const platform = { locale: 'en', workspace: 'platform' } as const;
const vendor = { locale: 'en', workspace: 'vendor' } as const;
it.each(['admin', 'vendor', 'staff'])(
  'opens %s return and refund links under current VIEW_RETURNS',
  (dashboard) => {
    const target = notificationTarget(`/bn/${dashboard}/returns/case%5F1`)!;
    expect(target).toEqual({ screen: 'return', id: 'case_1' });
    expect(targetRoute(target)).toEqual({
      href: { pathname: '/returns/[id]', params: { id: 'case_1' } },
      capability: 'VIEW_RETURNS',
    });
    const refund = notificationTarget(`/ar/${dashboard}/refunds/refund_1`)!;
    expect(targetRoute(refund)).toEqual({
      href: { pathname: '/refunds/[id]', params: { id: 'refund_1' } },
      capability: 'VIEW_RETURNS',
    });
    expect(notificationWorkspace(`/en/${dashboard}/returns`)).toBe(
      dashboard === 'vendor' ? 'vendor' : 'platform'
    );
  }
);
it('rejects unrecognized nested return routes and refreshes only the addressed workspace', () => {
  expect(notificationTarget('/en/admin/returns/case_1/delete')).toBeNull();
  expect(pushRefreshKeys({ url: '/en/vendor/returns/case_1' }, platform)).toEqual([
    NOTIFICATION_QUERIES,
  ]);
  expect(pushRefreshKeys({ url: '/en/vendor/returns/case_1' }, vendor)).toEqual([
    NOTIFICATION_QUERIES,
    queryKeys.returnDetail(vendor, 'case_1'),
    queryKeys.returnLists(vendor),
    queryKeys.home(vendor),
    queryKeys.orderLists(vendor),
  ]);
  expect(pushRefreshKeys({ url: '/en/admin/refunds/refund_1' }, platform)).toContainEqual(
    queryKeys.refund(platform, 'refund_1')
  );
});
