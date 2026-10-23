import { OrderActionResult, OrderDetail, OrderList } from '@/contracts/mobile/biz/v1';

import { ACCOUNTS } from '../mocks/fixtures/accounts';
import { changeMockOrder, raceNextOrderAction } from '../mocks/routes/orders';
import { resetMockServer } from '../mocks/server';
import { as, call, dataOf, keyed, refusalOf } from './mock-helpers';

beforeEach(resetMockServer);

const action = (id: string, headers: Record<string, string>, key: string, body: unknown) =>
  call(`/orders/${id}/actions`, { method: 'POST', headers: keyed(headers, key), body });

describe('the lists', () => {
  it("shows the store's operators every order, each whole", async () => {
    const list = await dataOf(OrderList, '/orders', { headers: await as('admin@example.com') });
    expect(list.items.map((order) => order.number)).toContain('1034');
    const split = list.items.find((order) => order.id === 'ord_1042');
    expect(split).toMatchObject({ status: 'pending', itemCount: 3, customerName: 'Karim Uddin' });
  });

  it('shows a seller only their consignment of each order', async () => {
    const list = await dataOf(OrderList, '/orders', { headers: await as('seller@example.com') });
    const split = list.items.find((order) => order.id === 'ord_1042');
    expect(split).toMatchObject({ itemCount: 1 });
    expect(list.items.map((order) => order.id)).not.toContain('ord_1029');

    const detail = await dataOf(OrderDetail, '/orders/ord_1042', {
      headers: await as('seller@example.com'),
    });
    expect(detail.lines.map((line) => line.name)).toEqual(['Linen tea towel (set of 2)']);
    expect(detail.consignments).toHaveLength(1);
    expect(detail.billingAddress).toBeUndefined();
  });

  it("shows a seller's staff only the orders wholly their seller's", async () => {
    const headers = await as('seller-staff@example.com');
    const list = await dataOf(OrderList, '/orders', { headers });
    expect(list.items.map((order) => order.id)).not.toContain('ord_1042');
    await refusalOf(404, 'NOT_FOUND', '/orders/ord_1042', { headers });
  });

  it('filters by tab and search, and pages with the cursor it gave out', async () => {
    const headers = await as('admin@example.com');
    const needing = await dataOf(OrderList, '/orders?tab=needs_action', { headers });
    expect(new Set(needing.items.map((order) => order.status))).toEqual(
      new Set(['pending', 'processing'])
    );
    const preOrders = await dataOf(OrderList, '/orders?tab=pre_orders', { headers });
    expect(preOrders.items.map((order) => order.number)).toEqual(['1039']);
    const found = await dataOf(OrderList, '/orders?search=rina', { headers });
    expect(found.items.map((order) => order.number)).toEqual(['1041']);

    const first = await dataOf(OrderList, '/orders?limit=5', { headers });
    expect(first.items).toHaveLength(5);
    const second = await dataOf(OrderList, `/orders?limit=5&cursor=${first.nextCursor}`, {
      headers,
    });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    await refusalOf(400, 'VALIDATION_ERROR', '/orders?cursor=made-up', { headers });
  });

  it('continues after the last order shown, when it left the tab between two pages', async () => {
    const headers = await as('admin@example.com');
    const all = await dataOf(OrderList, '/orders?tab=needs_action&limit=40', { headers });
    const first = await dataOf(OrderList, '/orders?tab=needs_action&limit=2', { headers });
    expect(first.items.map((order) => order.id)).toEqual(all.items.slice(0, 2).map(({ id }) => id));

    // A colleague ships the last order shown: it leaves "Needs action".
    changeMockOrder(first.items[1]?.id ?? '', (order) => {
      for (const part of order.consignments) part.status = 'shipped';
    });
    const cursor = encodeURIComponent(first.nextCursor ?? '');
    const second = await dataOf(OrderList, `/orders?tab=needs_action&limit=2&cursor=${cursor}`, {
      headers,
    });

    expect(second.items[0]?.id).toBe(all.items[2]?.id);
  });

  it('answers an unchanged list and order with 304', async () => {
    const headers = await as('admin@example.com');
    const { response } = await call('/orders/ord_1041', { headers });
    const etag = response.headers.get('etag') ?? '';
    const again = await call('/orders/ord_1041', {
      headers: { ...headers, 'If-None-Match': etag },
    });
    expect(again.response.status).toBe(304);
  });

  it('describes a walk-in sale with no customer', async () => {
    const detail = await dataOf(OrderDetail, '/orders/ord_1034', {
      headers: await as('admin@example.com'),
    });
    expect(detail).toMatchObject({ channel: 'pos', customer: {} });
  });
});

describe('the workflow', () => {
  it('takes the next step and answers the order after it', async () => {
    const headers = await as('admin@example.com');
    const before = await dataOf(OrderDetail, '/orders/ord_1040', { headers });
    expect(before.actions).toEqual(['mark_processing', 'cancel']);

    const { body } = await action('ord_1040', headers, 'k1', { action: 'mark_processing' });
    const after = OrderActionResult.parse(body.data).order;
    expect(after.status).toBe('processing');
    expect(after.timeline[0]).toMatchObject({ kind: 'status_change', by: 'Amina Rahman' });
  });

  it('needs a carrier and a tracking number to mark an order shipped', async () => {
    const headers = await as('admin@example.com');
    const { response, body } = await action('ord_1041', headers, 'k1', { action: 'mark_shipped' });
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ reason: 'TRACKING_REQUIRED' });
    expect(Object.keys(body.errors)).toEqual(['carrier', 'trackingNumber']);

    const shipped = await action('ord_1041', headers, 'k2', {
      action: 'mark_shipped',
      carrier: 'Pathao',
      trackingNumber: 'PTH-1',
    });
    expect(OrderActionResult.parse(shipped.body.data).order.consignments[0]?.tracking).toEqual({
      carrier: 'Pathao',
      number: 'PTH-1',
    });
  });

  it('never cancels a paid order, and offers no cancel on one', async () => {
    const headers = await as('admin@example.com');
    const detail = await dataOf(OrderDetail, '/orders/ord_1041', { headers });
    expect(detail.actions).not.toContain('cancel');

    const { response, body } = await action('ord_1041', headers, 'k1', { action: 'cancel' });
    expect(response.status).toBe(409);
    expect(body.reason).toBe('CANCEL_NEEDS_REFUND');
  });

  it('refuses shipping on an address hold and a pickup, and a step out of turn', async () => {
    const admin = await as('admin@example.com');
    const held = await action('ord_1038', admin, 'k1', {
      action: 'mark_shipped',
      carrier: 'RedX',
      trackingNumber: 'R1',
    });
    expect(held.body.reason).toBe('ADDRESS_ON_HOLD');

    const seller = await as('seller@example.com');
    const pickup = await action('ord_1033', seller, 'k2', {
      action: 'mark_shipped',
      carrier: 'RedX',
      trackingNumber: 'R2',
    });
    expect(pickup.body.reason).toBe('PICKUP_CONSIGNMENT');

    const early = await action('ord_1040', admin, 'k3', { action: 'mark_delivered' });
    expect(early.body.reason).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('offers nobody shipping on an order collected in person, and refuses it to the store too', async () => {
    const admin = await as('admin@example.com');
    const pickup = await dataOf(OrderDetail, '/orders/ord_1033', { headers: admin });
    expect(pickup.consignments.map((part) => part.pickup)).toEqual([true]);
    expect(pickup.actions).toEqual(['cancel']);

    const shipped = await action('ord_1033', admin, 'k1', {
      action: 'mark_shipped',
      carrier: 'RedX',
      trackingNumber: 'R1',
    });
    expect(shipped.response.status).toBe(409);
    expect(shipped.body.reason).toBe('PICKUP_CONSIGNMENT');
  });

  it("lets the store call off one seller's part of a split order, with a reason", async () => {
    const headers = await as('admin@example.com');
    const missing = await action('ord_1042', headers, 'k1', {
      action: 'cancel',
      consignmentId: 'con_1042_b',
    });
    expect(missing.body.errors).toHaveProperty('reason');

    const { body } = await action('ord_1042', headers, 'k2', {
      action: 'cancel',
      consignmentId: 'con_1042_b',
      reason: 'Out of stock at the seller',
    });
    const order = OrderActionResult.parse(body.data).order;
    expect(order.status).toBe('pending');
    expect(order.consignments.map((part) => part.status)).toEqual(['pending', 'cancelled']);
  });

  it('refuses cancel to whoever lacks the permission', async () => {
    const { body } = await action('ord_1040', await as('staff@example.com'), 'k1', {
      action: 'cancel',
    });
    expect(body.code).toBe('AUTHORIZATION_ERROR');
  });

  it('lets a grant to cancel, without one to move orders on, cancel and take no step', async () => {
    const grant = ACCOUNTS.find((account) => account.email === 'staff@example.com')?.grants[0];
    if (!grant) throw new Error('The mock store has no staff grant');
    const capabilities = jest.replaceProperty(grant, 'capabilities', [
      'VIEW_ORDERS',
      'CANCEL_ORDERS',
    ]);
    try {
      const headers = await as('staff@example.com');
      const detail = await dataOf(OrderDetail, '/orders/ord_1040', { headers });
      expect(detail.actions).toEqual(['cancel']);

      const step = await action('ord_1040', headers, 'k1', { action: 'mark_processing' });
      expect(step.body.code).toBe('AUTHORIZATION_ERROR');
      const { body } = await action('ord_1040', headers, 'k2', {
        action: 'cancel',
        reason: 'The customer asked to cancel',
      });
      expect(OrderActionResult.parse(body.data).order.status).toBe('cancelled');
    } finally {
      capabilities.restore();
    }
  });

  it('makes a step once per key, and refuses a key used for another step', async () => {
    const headers = await as('admin@example.com');
    const first = await action('ord_1040', headers, 'same', { action: 'mark_processing' });
    const replay = await action('ord_1040', headers, 'same', { action: 'mark_processing' });
    expect(replay.response.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    const reused = await action('ord_1040', headers, 'same', { action: 'cancel' });
    expect(reused.response.status).toBe(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const unkeyed = await call('/orders/ord_1040/actions', {
      method: 'POST',
      headers,
      body: { action: 'cancel' },
    });
    expect(unkeyed.response.status).toBe(400);
  });

  it('answers a lost race with the order as it now is', async () => {
    const headers = await as('admin@example.com');
    raceNextOrderAction('ord_1040', (order) => {
      for (const part of order.consignments) part.status = 'processing';
    });

    const { response, body } = await action('ord_1040', headers, 'k1', { action: 'cancel' });

    expect(response.status).toBe(409);
    expect(body.reason).toBe('ORDER_STATE_CHANGED');
    expect(OrderDetail.parse(body.details.order).status).toBe('processing');
  });
});
