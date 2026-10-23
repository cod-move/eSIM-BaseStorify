import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Animated } from 'react-native';
import * as endpoints from '@/api/endpoints/returns';
import { ApiError, NetworkError } from '@/api/errors';
import { allMockProducts } from '@/api/mocks/routes/products';
import { changeMockRefund, setNextMockRefundStatus } from '@/api/mocks/routes/returns';
import './hooks';
import './preload-app';
import { currentPath, openTab, press, settle, signIn, tap, type, wait } from './screens';
beforeEach(() => {
  const timing = Animated.timing;
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    if (config.duration !== 320 && config.duration !== 200) return timing(value, config);
    return {
      start: (done) => {
        if (value instanceof Animated.Value && typeof config.toValue === 'number')
          value.setValue(config.toValue);
        done?.({ finished: true });
      },
      stop: () => undefined,
      reset: () => undefined,
    };
  });
});
afterEach(() => jest.restoreAllMocks());
async function choose(label: string, name: string) {
  await press(label);
  await wait(400);
  await tap(screen.getByRole('radio', { name }));
  await wait(400);
}
async function newReturn() {
  await signIn();
  await act(async () => router.push({ pathname: '/returns/new', params: { orderId: 'ord_1036' } }));
  await settle();
  await screen.findByLabelText('Return quantity for item 1');
  await type('Return quantity for item 1', '1');
  await choose('Return reason', 'Wrong size or variant');
}
async function submitAction() {
  await press('Review action');
  await wait(400);
  await press('Confirm');
  await settle();
}
it('completes native creation, approval, receipt, restock, refund and external settlement', async () => {
  const before = allMockProducts().find((p) => p.id === 'prod_vase')!.stock.loc_main!.available;
  await newReturn();
  await press('Review return');
  await settle();
  expect(screen.getByText('Ceramic bud vase: 1 units')).toBeVisible();
  await press('Create return');
  await wait(400);
  await press('Confirm');
  await settle();
  expect(currentPath()).toMatch(/^\/returns\/ret_/);
  await press('Approve return');
  await settle();
  await submitAction();
  expect(currentPath()).toMatch(/^\/returns\/ret_/);
  await press('Record received items');
  await settle();
  expect(screen.getByRole('button', { name: 'Condition for item 1' })).toBeVisible();
  await type('Return quantity for item 1', '1');
  await submitAction();
  await press('Restock items');
  await settle();
  await type('Return quantity for item 1', '1');
  await choose('Stock location', 'Main warehouse');
  await submitAction();
  expect(allMockProducts().find((p) => p.id === 'prod_vase')!.stock.loc_main!.available).toBe(
    before + 1
  );
  await press('Review refund');
  await settle();
  await press('Review refund');
  await settle();
  await press('Confirm refund');
  await wait(400);
  await press('Confirm');
  await settle();
  expect(currentPath()).toMatch(/^\/refunds\/refund_/);
  expect(screen.getByText('Settlement required')).toBeVisible();
  await press('View return');
  await settle();
  await press('Record refund settlement');
  await settle();
  await type('Settlement method, required', 'Bank transfer');
  await type('Settlement reference, Optional', 'TRANSFER-123');
  await submitAction();
  expect(screen.getByText('Refund confirmed')).toBeVisible();
}, 20000);
it('protects a dirty return from header navigation and discards only after confirmation', async () => {
  await newReturn();
  await press('Back');
  await wait(400);
  expect(screen.getByRole('header', { name: 'Discard changes?' })).toBeVisible();
  await press('Keep editing');
  await wait(400);
  expect(screen.getByLabelText('Return quantity for item 1')).toHaveDisplayValue('1');
  await press('Back');
  await wait(400);
  await press('Discard');
  await settle();
  expect(currentPath()).toBe('/');
});
it('recovers a lost creation reply without a second create request', async () => {
  await newReturn();
  const original = endpoints.createReturn;
  const send = jest.spyOn(endpoints, 'createReturn').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    throw new ApiError(409, 'CONFLICT', '', {
      reason: 'OPERATION_RECONCILIATION_REQUIRED',
      details: { operation: { ...result.operation, state: 'unknown' } },
    });
  });
  await press('Review return');
  await settle();
  await press('Create return');
  await wait(400);
  await press('Confirm');
  await settle();
  expect(await screen.findByRole('button', { name: 'Check original operation' })).toBeVisible();
  await press('Check original operation');
  await settle();
  expect(currentPath()).toMatch(/^\/returns\/ret_/);
  expect(send).toHaveBeenCalledTimes(1);
});
it('performs a partial order refund and refreshes its pending receipt without another payment', async () => {
  await signIn();
  await act(async () =>
    router.push({ pathname: '/refunds/new', params: { kind: 'order', targetId: 'ord_1041' } })
  );
  await settle();
  await type('Refund amount, Optional', '10');
  await press('Review refund');
  await settle();
  expect(screen.getAllByText('$10.00').length).toBeGreaterThan(0);
  const send = jest.spyOn(endpoints, 'executeRefund');
  setNextMockRefundStatus('processing');
  await press('Confirm refund');
  await wait(400);
  await press('Confirm');
  await settle();
  expect(screen.getByText('Processing')).toBeVisible();
  const id = currentPath().split('/').at(-1)!;
  changeMockRefund(id, 'succeeded');
  await press('Refresh settlement status');
  await settle();
  expect(await screen.findByText('Refund confirmed')).toBeVisible();
  expect(send).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'View return' })).toBeNull();
});
it('opens the exact open-return queue from Home and preserves Account destinations', async () => {
  await signIn();
  await tap(screen.getByRole('button', { name: 'Open returns, 1' }));
  await settle();
  expect(currentPath()).toBe('/returns');
  expect(screen.getByRole('button', { name: 'Return R1001' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Open' })).toBeSelected();
  await press('Back');
  await settle();
  await openTab('Account');
  expect(screen.getByRole('button', { name: 'Seller applications' })).toBeVisible();
  await press('Returns and refunds');
  await settle();
  expect(currentPath()).toBe('/returns');
  // The card counts open returns: the list opens on them.
  expect(screen.getByRole('tab', { name: 'Open' })).toBeSelected();
});
it('frees a return the store never received, to review and send again under a new key', async () => {
  await newReturn();
  await press('Review return');
  await settle();
  const original = endpoints.createReturn;
  // The request never reaches the store, nor do its retries: no answer, and nothing recorded.
  const send = jest.spyOn(endpoints, 'createReturn').mockRejectedValue(new NetworkError('timeout'));
  await press('Create return');
  await wait(400);
  await press('Confirm');
  // The tap's own retries wait between tries.
  await wait(10_000);
  expect(screen.getByRole('button', { name: 'Check original operation' })).toBeVisible();

  // Nothing is in flight: the operator may leave, told the operation stays to be checked.
  await press('Back');
  await wait(400);
  expect(
    screen.getByText(
      'These details will be removed. The original operation stays unconfirmed: check it when you open this again.'
    )
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
  await press('Keep editing');
  await wait(400);

  // The store has no record of the key: nothing was made, and the draft is free.
  send.mockImplementation(original);
  await press('Check original operation');
  await settle();
  expect(screen.getByText('Not sent')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Check original operation' })).toBeNull();
  await press('Review return');
  await settle();
  await press('Create return');
  await wait(400);
  await press('Confirm');
  await settle();
  expect(currentPath()).toMatch(/^\/returns\/ret_/);
  expect(new Set(send.mock.calls.map((call) => call[2])).size).toBe(2);
}, 20000);
it('reads on past a filtered page that came back empty instead of saying there are none', async () => {
  await signIn();
  const original = endpoints.getReturns;
  // The store filters after paging: the tab's first page is empty, with more after it.
  jest
    .spyOn(endpoints, 'getReturns')
    .mockImplementation((scope, query, signal) =>
      query.cursor === undefined
        ? Promise.resolve({ items: [], nextCursor: 'after-empty' })
        : original(
            scope,
            { ...query, cursor: query.cursor === 'after-empty' ? undefined : query.cursor },
            signal
          )
    );
  await act(async () => router.push({ pathname: '/returns', params: { tab: 'open' } }));
  await settle();
  expect(await screen.findByRole('button', { name: 'Return R1001' })).toBeVisible();
  expect(screen.queryByText('No returns')).toBeNull();
});
it('sends an order refund that needs an external payment to the website to record it', async () => {
  await signIn();
  await act(async () =>
    router.push({ pathname: '/refunds/new', params: { kind: 'order', targetId: 'ord_1041' } })
  );
  await settle();
  await type('Refund amount, Optional', '10');
  await press('Review refund');
  await settle();
  setNextMockRefundStatus('manual_required');
  await press('Confirm refund');
  await wait(400);
  await press('Confirm');
  await settle();
  expect(currentPath()).toMatch(/^\/refunds\/refund_/);
  expect(
    screen.getByText(
      'The customer still needs an external payment. Record its settlement on the website once it has been sent.'
    )
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open the website' })).toBeVisible();
});
it('says a return or refund opened without its order or return cannot be found', async () => {
  await signIn();
  await act(async () => router.push('/returns/new'));
  await settle();
  expect(
    screen.getByText(
      "We couldn't find that. It may have been removed, or it's outside what you can see."
    )
  ).toBeVisible();
  await act(async () => router.push('/refunds/new'));
  await settle();
  expect(
    screen.getAllByText(
      "We couldn't find that. It may have been removed, or it's outside what you can see."
    ).length
  ).toBeGreaterThan(0);
});
it('hides return/refund and creation entries from read-only staff while keeping scanning', async () => {
  await signIn('staff@example.com');
  expect(screen.queryByRole('button', { name: 'Create order' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Scan barcode' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Open returns/ })).toBeNull();
  await openTab('Account');
  expect(screen.queryByRole('button', { name: 'Returns and refunds' })).toBeNull();
  await act(async () => router.push('/returns'));
  await settle();
  expect(currentPath()).toBe('/more');
});
