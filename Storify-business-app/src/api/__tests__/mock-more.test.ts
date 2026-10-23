import {
  Device,
  DeviceRemoval,
  Home,
  MarkNotificationsReadRequest,
  NotificationList,
  NotificationsReadResult,
  OrderList,
  PayoutDetail,
  PayoutList,
  PayoutSummary,
  ProductList,
  VendorApplicationDecisionRequest,
  VendorApplicationDecisionResult,
  VendorApplicationDetail,
  VendorApplicationList,
} from '@/contracts/mobile/biz/v1';

import { resetMockServer } from '../mocks/server';
import { as, call, dataOf, keyed, refusalOf } from './mock-helpers';

beforeEach(resetMockServer);

describe('Home', () => {
  it('shows each tile with its capability, counting what its list holds', async () => {
    const headers = await as('admin@example.com');
    const home = await dataOf(Home, '/home', { headers });
    expect(home.tiles.map((tile) => tile.kind)).toEqual([
      'COLLECTED_TODAY',
      'COLLECTED_THIS_MONTH',
      'ORDERS_NEEDING_ACTION',
      'UNREAD_MESSAGES',
      'LOW_STOCK',
      'OPEN_RETURNS',
    ]);

    const needing = await dataOf(OrderList, '/orders?tab=needs_action&limit=40', { headers });
    const low = await dataOf(ProductList, '/products?lowStock=true&limit=40', { headers });
    const count = (kind: string) => home.tiles.find((tile) => tile.kind === kind)?.count;
    expect(count('ORDERS_NEEDING_ACTION')).toBe(needing.items.length);
    expect(count('LOW_STOCK')).toBe(low.items.length);
    expect(home.collectionTrend?.points).toHaveLength(7);
    const today = home.collectionTrend?.points.at(-1);
    expect(today?.day).toBe(home.day);
    expect(today?.money).toEqual(home.tiles.find((tile) => tile.kind === 'COLLECTED_TODAY')?.money);
    expect(
      home.collectionTrend?.points.every(
        (point) => Number.isFinite(point.fraction) && point.fraction >= 0 && point.fraction <= 1
      )
    ).toBe(true);
  });

  it('leaves out the tiles an operator may not open', async () => {
    const home = await dataOf(Home, '/home', { headers: await as('unpaid-seller@example.com') });
    expect(home.tiles.map((tile) => tile.kind)).toEqual(['LOW_STOCK']);
    expect(home.collectionTrend).toBeUndefined();
  });
});

describe('payouts', () => {
  it("answers a seller's balance, payouts and one payout", async () => {
    const headers = await as('seller@example.com');
    await dataOf(PayoutSummary, '/payouts/summary', { headers });
    const list = await dataOf(PayoutList, '/payouts?status=paid', { headers });
    expect(list.items.every((payout) => payout.status === 'paid')).toBe(true);
    const payout = await dataOf(PayoutDetail, `/payouts/${list.items[0]?.id}`, { headers });
    expect(payout.net.amount).toBeCloseTo(
      payout.gross.amount -
        payout.commission.amount +
        (payout.shipping?.amount ?? 0) +
        payout.adjustments.amount
    );
  });

  it('answers the balance in the currency asked for, else the store’s, with those on offer', async () => {
    const headers = await as('seller@example.com');
    const own = await dataOf(PayoutSummary, '/payouts/summary', { headers });
    expect(own.availableCurrencies).toEqual(['EUR', 'USD']);
    expect(own.readyToPay.currency).toBe('USD');

    const euros = await dataOf(PayoutSummary, '/payouts/summary?currency=eur', { headers });
    expect(euros.availableCurrencies).toEqual(['EUR', 'USD']);
    for (const amount of [
      euros.readyToPay,
      euros.heldInReturnWindow.amount,
      euros.reserveHeld.amount,
      euros.owedToPlatform,
      euros.minimumPayout,
    ]) {
      expect(amount.currency).toBe('EUR');
    }

    await refusalOf(400, 'VALIDATION_ERROR', '/payouts/summary?currency=euro', { headers });
  });

  it("refuses a seller's staff, who lack the capability", async () => {
    await refusalOf(403, 'AUTHORIZATION_ERROR', '/payouts', {
      headers: await as('seller-staff@example.com'),
    });
  });
});

describe('vendor applications', () => {
  it('lists the pending ones, the longest waiting first, with their documents', async () => {
    const headers = await as('admin@example.com');
    const pending = await dataOf(VendorApplicationList, '/vendor-applications', { headers });
    expect(pending.items.map((application) => application.id)).toEqual([
      'vendor_pixel',
      'vendor_sunrise',
    ]);
    const detail = await dataOf(VendorApplicationDetail, '/vendor-applications/vendor_sunrise', {
      headers,
    });
    expect(detail.canDecide).toBe(true);
    expect(detail.documents[2]).toMatchObject({ kind: 'food_permit', label: 'Food safety permit' });
  });

  it('decides once, and needs a reason to reject', async () => {
    const headers = await as('admin@example.com');
    const decide = (id: string, key: string, body: unknown) =>
      call(`/vendor-applications/${id}/decision`, {
        method: 'POST',
        headers: keyed(headers, key),
        body,
      });

    expect((await decide('vendor_sunrise', 'k1', { decision: 'reject' })).body.reason).toBe(
      'REASON_REQUIRED'
    );
    const approved = VendorApplicationDecisionResult.parse(
      (await decide('vendor_sunrise', 'k2', { decision: 'approve' })).body.data
    );
    expect(approved).toMatchObject({
      application: { status: 'approved' },
      vendorStatus: 'approved',
    });
    expect((await decide('vendor_sunrise', 'k3', { decision: 'approve' })).body.reason).toBe(
      'ALREADY_DECIDED'
    );
    expect((await decide('vendor_draft', 'k4', { decision: 'approve' })).body.reason).toBe(
      'NOT_SUBMITTED'
    );
  });

  it('refuses a reason longer than the contract allows, and decides nothing', async () => {
    const headers = await as('admin@example.com');
    const path = '/vendor-applications/vendor_sunrise/decision';
    const tooLong = { decision: 'reject', reason: 'x'.repeat(1001) };
    expect(VendorApplicationDecisionRequest.safeParse(tooLong).success).toBe(false);

    const refusal = await refusalOf(400, 'VALIDATION_ERROR', path, {
      method: 'POST',
      headers: keyed(headers, 'k1'),
      body: tooLong,
    });
    expect(Object.keys(refusal.errors ?? {})).toEqual(['reason']);

    const rejected = await dataOf(VendorApplicationDecisionResult, path, {
      method: 'POST',
      headers: keyed(headers, 'k2'),
      body: { decision: 'reject', reason: 'x'.repeat(1000) },
    });
    expect(rejected.application.status).toBe('rejected');
  });
});

describe('notifications and devices', () => {
  it("lists the operator's notifications and marks them read", async () => {
    const headers = await as('seller@example.com');
    const list = await dataOf(NotificationList, '/notifications', { headers });
    expect(list.unreadCount).toBe(2);
    expect(list.items[0]?.link).toMatch(/^\/en\/vendor\//);

    const read = await dataOf(NotificationsReadResult, '/notifications', {
      method: 'PATCH',
      headers,
      body: { all: true },
    });
    expect(read.unreadCount).toBe(0);
    const unread = await dataOf(NotificationList, '/notifications?unreadOnly=true', { headers });
    expect(unread.items).toEqual([]);
  });

  it('marks no more ids at once than the contract allows', async () => {
    const headers = await as('seller@example.com');
    const ids = Array.from({ length: 101 }, (_, index) => `ntf_${index}`);
    expect(MarkNotificationsReadRequest.safeParse({ ids }).success).toBe(false);

    const refusal = await refusalOf(400, 'VALIDATION_ERROR', '/notifications', {
      method: 'PATCH',
      headers,
      body: { ids },
    });
    expect(Object.keys(refusal.errors ?? {})).toEqual(['ids']);
    // A hundred is taken; ids that are not the operator's are skipped.
    const read = await dataOf(NotificationsReadResult, '/notifications', {
      method: 'PATCH',
      headers,
      body: { ids: ids.slice(0, 100) },
    });
    expect(read.unreadCount).toBe(2);
  });

  it("registers this phone's token in the request's language, and removes it", async () => {
    const headers = await as('admin@example.com');
    const device = await dataOf(Device, '/devices', {
      method: 'POST',
      headers,
      locale: 'bn',
      body: { token: 'ExponentPushToken[abc]', platform: 'ios' },
    });
    expect(device.locale).toBe('bn');

    const path = `/devices/${encodeURIComponent('ExponentPushToken[abc]')}`;
    expect(await dataOf(DeviceRemoval, path, { method: 'DELETE', headers })).toEqual({
      removed: true,
    });
    expect(await dataOf(DeviceRemoval, path, { method: 'DELETE', headers })).toEqual({
      removed: false,
    });
  });
});
