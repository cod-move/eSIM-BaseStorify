import { NOTIFICATION_QUERIES, queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';

import { pushRefreshKeys, pushTarget, readPushData } from '../push-refresh';

const platform: WorkspaceScope = { locale: 'en', workspace: 'platform' };
const vendor: WorkspaceScope = { locale: 'en', workspace: 'vendor' };

describe('what a push that arrives reads again', () => {
  it('the notifications always, and the lists of what it is about in the workspace on screen', () => {
    expect(
      pushRefreshKeys(
        { url: '/en/admin/inbox?view=chat&conversation=c1', type: 'chat_message' },
        platform
      )
    ).toEqual([
      NOTIFICATION_QUERIES,
      queryKeys.conversationMessages(platform, 'c1'),
      queryKeys.conversationLists(platform),
      queryKeys.home(platform),
    ]);
    // Orders are useOrderPushRefresh's (features/orders): not read twice.
    expect(pushRefreshKeys({ url: '/en/vendor/orders/o1', type: 'order_placed' }, vendor)).toEqual([
      NOTIFICATION_QUERIES,
    ]);
    expect(
      pushRefreshKeys({ url: '/en/vendor/products', type: 'product_low_stock' }, vendor)
    ).toEqual([NOTIFICATION_QUERIES, queryKeys.productLists(vendor), queryKeys.home(vendor)]);
    expect(pushRefreshKeys({ url: '/en/admin/vendors/v1' }, platform)).toEqual([
      NOTIFICATION_QUERIES,
      queryKeys.vendorApplication(platform, 'v1'),
      queryKeys.vendorApplicationLists(platform),
    ]);
    expect(pushRefreshKeys({ url: '/en/vendor/payouts/p1' }, vendor)).toEqual([
      NOTIFICATION_QUERIES,
      queryKeys.payoutData(vendor),
    ]);
  });

  it('nothing of this workspace for a push about the other one', () => {
    expect(
      pushRefreshKeys({ url: '/en/vendor/inbox?conversation=c1', type: 'chat_message' }, platform)
    ).toEqual([NOTIFICATION_QUERIES]);
  });

  it.each([
    ['/en/admin/products/p1/edit', platform, vendor],
    ['/en/staff/products/p1/edit', platform, vendor],
    ['/en/vendor/products/p1/edit', vendor, platform],
  ] as const)(
    'refreshes product stock for a low-stock editor link %s only in its workspace',
    (url, scope, otherScope) => {
      const data = { url, type: 'product_low_stock' };
      expect(pushTarget(data)).toEqual({ screen: 'stock', id: 'p1' });
      expect(pushRefreshKeys(data, scope)).toEqual([
        NOTIFICATION_QUERIES,
        queryKeys.product(scope, 'p1'),
        queryKeys.productStock(scope, 'p1'),
        queryKeys.productLists(scope),
        queryKeys.home(scope),
      ]);
      expect(pushRefreshKeys(data, otherScope)).toEqual([NOTIFICATION_QUERIES]);
    }
  );

  it('refreshes the return queues for a known link and reads only notifications without a workspace or link', () => {
    expect(pushRefreshKeys({ url: '/en/admin/returns' }, platform)).toEqual([
      NOTIFICATION_QUERIES,
      queryKeys.returnLists(platform),
      queryKeys.home(platform),
      queryKeys.orderLists(platform),
    ]);
    expect(pushRefreshKeys({}, platform)).toEqual([NOTIFICATION_QUERIES]);
    expect(pushRefreshKeys({ url: '/en/admin/orders/o1' }, null)).toEqual([NOTIFICATION_QUERIES]);
  });
});

describe('a push’s data, from outside the app', () => {
  it('keeps only non-empty strings', () => {
    expect(readPushData({ url: ' /en/admin/orders/o1 ', type: 7, notificationId: '' })).toEqual({
      url: '/en/admin/orders/o1',
      type: null,
      notificationId: null,
    });
    expect(readPushData(null)).toEqual({ url: null, type: null, notificationId: null });
  });

  it('says which screen it is about', () => {
    expect(pushTarget({ url: '/en/staff/inbox?conversation=c9' })).toEqual({
      screen: 'conversation',
      id: 'c9',
    });
    expect(pushTarget({ type: 'chat_message' })).toBeNull();
  });
});
