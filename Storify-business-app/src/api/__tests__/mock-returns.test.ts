import {
  ReturnList,
  ReturnCase,
  ReturnOptions,
  ReturnPreview,
  ReturnCreateResult,
  ReturnActionResult,
  RefundPreview,
  RefundResult,
  OperationStatus,
  BizUploadResult,
  BizUploadAccess,
  Home,
  API_BASE_PATH,
  type ReturnCreateRequest,
  type ReturnActionRequest,
} from '@/contracts/mobile/biz/v1';
import { resetMockServer, mockFetch } from '../mocks/server';
import { changeMockOrder, allMockOrders } from '../mocks/routes/orders';
import { allMockProducts } from '../mocks/routes/products';
import { expireMockRefundQuotes, setNextMockRefundStatus } from '../mocks/routes/returns';
import { as, call, dataOf, keyed, refusalOf, ORIGIN } from './mock-helpers';
let sequence = 0;
const key = () => `05dd058f-5271-4bea-8f69-${String(++sequence).padStart(12, '0')}`;
beforeEach(() => {
  resetMockServer();
  sequence = 0;
});
const admin = () => as('admin@example.com', 'platform');
const read = (headers: Record<string, string>, id = 'ret_store_1') =>
  dataOf(ReturnCase, `/returns/${id}`, { headers });
const act = async (
  headers: Record<string, string>,
  id: string,
  action: ReturnActionRequest['action'],
  extras: Partial<ReturnActionRequest> = {},
  operationKey = key()
) => {
  const row = await read(headers, id);
  return dataOf(ReturnActionResult, `/returns/${id}/actions`, {
    headers: keyed(headers, operationKey),
    method: 'POST',
    body: { action, version: row.version, ...extras },
  });
};
async function draft(
  headers: Record<string, string>,
  extras: Partial<ReturnCreateRequest> = {}
): Promise<ReturnCreateRequest> {
  const offered = await dataOf(ReturnOptions, '/returns/options?orderId=ord_1036', { headers });
  return {
    orderId: 'ord_1036',
    version: offered.version,
    items: [{ index: 0, quantity: 1 }],
    reason: 'wrong_size_or_variant',
    resolution: 'refund',
    returnMethod: 'customer_ships',
    ...extras,
  };
}
it('matches open Home counts, narrows search/order and denies read-only grants', async () => {
  const headers = await admin();
  const home = await dataOf(Home, '/home', { headers });
  const queue = await dataOf(ReturnList, '/returns?tab=open', { headers });
  expect(queue.items).toHaveLength(home.tiles.find((tile) => tile.kind === 'OPEN_RETURNS')!.count!);
  await act(headers, 'ret_store_1', 'reject', { reason: 'Outside policy' });
  expect((await dataOf(ReturnList, '/returns?tab=open', { headers })).items).toHaveLength(0);
  expect(
    (await dataOf(ReturnList, '/returns?tab=completed&orderId=ord_1036&search=R1001', { headers }))
      .items
  ).toHaveLength(1);
  await refusalOf(403, 'AUTHORIZATION_ERROR', '/returns', {
    headers: await as('staff@example.com', 'platform'),
  });
});
it('creates and replays one case, preserves original eligible quantities and an operation receipt', async () => {
  const headers = await admin();
  const body = await draft(headers);
  const operationKey = key();
  const args = { headers: keyed(headers, operationKey), method: 'POST', body };
  const first = await dataOf(ReturnCreateResult, '/returns', args);
  const replay = await dataOf(ReturnCreateResult, '/returns', args);
  expect(replay).toEqual(first);
  expect((await dataOf(ReturnList, '/returns', { headers })).items).toHaveLength(2);
  expect(
    (await dataOf(ReturnOptions, '/returns/options?orderId=ord_1036', { headers })).lines[0]!
      .eligible
  ).toBe(0);
  expect(
    (await dataOf(OperationStatus, `/operations?key=${operationKey}`, { headers })).resources
  ).toEqual([{ kind: 'return', id: first.returns[0]!.id }]);
});
it('refuses duplicate lines and concurrent over-consumption without creating an extra case', async () => {
  const headers = await admin();
  const body = await draft(headers);
  const duplicate = await refusalOf(409, 'CONFLICT', '/returns', {
    headers: keyed(headers, key()),
    method: 'POST',
    body: { ...body, items: [...body.items, ...body.items] },
  });
  expect(duplicate.reason).toBe('RETURN_ITEM_LISTED_TWICE');
  const results = await Promise.all([
    call('/returns', { headers: keyed(headers, key()), method: 'POST', body }),
    call('/returns', { headers: keyed(headers, key()), method: 'POST', body }),
  ]);
  expect(results.map((r) => r.response.status).sort()).toEqual([200, 409]);
  expect((await dataOf(ReturnList, '/returns', { headers })).items).toHaveLength(2);
});
it('groups mixed-owner returns atomically and a seller sees only their original lines', async () => {
  changeMockOrder('ord_1041', (order) => {
    order.consignments.forEach((p) => {
      p.status = 'delivered';
    });
  });
  const headers = await admin();
  const options = await dataOf(ReturnOptions, '/returns/options?orderId=ord_1041', { headers });
  const body = await draft(headers, {
    orderId: options.orderId,
    version: options.version,
    items: options.lines.map((l) => ({ index: l.index, quantity: 1 })),
  });
  const preview = await dataOf(ReturnPreview, '/returns/preview', {
    headers,
    method: 'POST',
    body,
  });
  const created = await dataOf(ReturnCreateResult, '/returns', {
    headers: keyed(headers, key()),
    method: 'POST',
    body,
  });
  expect(created.returns).toHaveLength(2);
  expect(created.returns.map((r) => r.estimate.total.formatted)).toEqual(
    preview.parcels.map((p) => p.refund.total.formatted)
  );
  const seller = await as('seller@example.com', 'vendor');
  const visible = await dataOf(ReturnList, '/returns', { headers: seller });
  expect(visible.items).toHaveLength(1);
  const own = await dataOf(ReturnOptions, '/returns/options?orderId=ord_1041', { headers: seller });
  expect(own.lines.map((l) => l.index)).toEqual([1]);
  const foreign = created.returns.find((r) => r.items.some((i) => i.orderItemIndex === 0))!;
  await refusalOf(404, 'NOT_FOUND', `/returns/${foreign.id}`, { headers: seller });
});
it('honors advertised decisions and refuses a stale version', async () => {
  const headers = await admin();
  const row = await read(headers);
  await act(headers, row.id, 'approve', {
    approvedItems: [{ index: 0, quantity: 1 }],
    returnMethod: 'customer_ships',
  });
  const stale = await refusalOf(409, 'CONFLICT', `/returns/${row.id}/actions`, {
    headers: keyed(headers, key()),
    method: 'POST',
    body: { action: 'reject', version: row.version, reason: 'Changed' },
  });
  expect(stale.reason).toBe('RETURN_STATE_CHANGED');
  expect((await read(headers)).actions).not.toContain('approve');
});
it('records receipts and keyed partial restock once, rejecting received and location conflicts', async () => {
  const headers = await admin();
  await act(headers, 'ret_store_1', 'approve', { approvedItems: [{ index: 0, quantity: 1 }] });
  await act(headers, 'ret_store_1', 'record_receipt', {
    receivedItems: [{ index: 0, quantity: 1, condition: 'new' }],
  });
  const row = await read(headers);
  const stock = allMockProducts().find((p) => p.id === 'prod_vase')!.stock.loc_main!.available;
  const args = {
    headers: keyed(headers, key()),
    method: 'POST',
    body: {
      action: 'restock',
      version: row.version,
      restockItems: [{ index: 0, quantity: 1 }],
      locationId: 'loc_main',
    },
  };
  await dataOf(ReturnActionResult, `/returns/${row.id}/actions`, args);
  await dataOf(ReturnActionResult, `/returns/${row.id}/actions`, args);
  expect(allMockProducts().find((p) => p.id === 'prod_vase')!.stock.loc_main!.available).toBe(
    stock + 1
  );
  const now = await read(headers);
  expect(now.items[0]!.quantityRestocked).toBe(1);
  const refusal = await refusalOf(409, 'CONFLICT', `/returns/${row.id}/actions`, {
    headers: keyed(headers, key()),
    method: 'POST',
    body: {
      action: 'record_receipt',
      version: now.version,
      receivedItems: [{ index: 0, quantity: 0, condition: 'new' }],
    },
  });
  expect(refusal.reason).toBe('RETURN_QUANTITY_CHANGED');
});
it('holds damaged receipts for write-off and rejects a foreign restock location', async () => {
  const headers = await admin();
  await act(headers, 'ret_store_1', 'approve', { approvedItems: [{ index: 0, quantity: 1 }] });
  await act(headers, 'ret_store_1', 'record_receipt', {
    receivedItems: [{ index: 0, quantity: 1, condition: 'damaged' }],
  });
  const row = await read(headers);
  await refusalOf(409, 'CONFLICT', `/returns/${row.id}/actions`, {
    headers: keyed(headers, key()),
    method: 'POST',
    body: {
      action: 'restock',
      version: row.version,
      restockItems: [{ index: 0, quantity: 1 }],
      locationId: 'loc_green',
    },
  });
  const result = await act(headers, row.id, 'record_disposition', {
    dispositions: [{ index: 0, quantity: 1, action: 'written_off' }],
    locationId: 'loc_main',
  });
  expect(result.return.items[0]).toMatchObject({ quantityWrittenOff: 1, quantityRestocked: 0 });
});
it('requires evidence when offered and signs private evidence only for a current scoped member', async () => {
  const headers = await admin();
  const body = await draft(headers, { reason: 'damaged_or_defective' });
  const failure = await refusalOf(409, 'CONFLICT', '/returns', {
    headers: keyed(headers, key()),
    method: 'POST',
    body,
  });
  expect(failure.reason).toBe('EVIDENCE_REQUIRED');
  const file = new FormData();
  file.append('purpose', 'return_evidence');
  file.append('target', JSON.stringify({ kind: 'order', id: 'ord_1036' }));
  file.append('file', new Blob(['proof'], { type: 'image/jpeg' }), 'proof.jpg');
  const response = await mockFetch(`${ORIGIN}${API_BASE_PATH}/en/uploads`, {
    headers: keyed(headers, key()),
    method: 'POST',
    body: file,
  });
  const uploaded = BizUploadResult.parse((await response.json()).data);
  const result = await dataOf(ReturnCreateResult, '/returns', {
    headers: keyed(headers, key()),
    method: 'POST',
    body: { ...body, evidenceIds: [uploaded.upload.id] },
  });
  const row = result.returns[0]!;
  expect(row.evidence[0]!.private).toBe(true);
  expect(row.evidence[0]!.url).toBeUndefined();
  const access = await dataOf(
    BizUploadAccess,
    `/returns/${row.id}/evidence/${uploaded.upload.id}`,
    { headers }
  );
  expect(access.url).toContain('/private/');
  await refusalOf(404, 'NOT_FOUND', `/returns/${row.id}/evidence/${uploaded.upload.id}`, {
    headers: await as('seller@example.com', 'vendor'),
  });
});
it('executes a partial no-return order refund once using its authoritative quote', async () => {
  const headers = await admin();
  const input = { target: { kind: 'order', id: 'ord_1041' }, amount: 10 };
  const quote = await dataOf(RefundPreview, '/refunds/preview', {
    headers,
    method: 'POST',
    body: input,
  });
  const args = {
    headers: keyed(headers, key()),
    method: 'POST',
    body: { preview: input, previewToken: quote.token },
  };
  const result = await dataOf(RefundResult, '/refunds/execute', args);
  const replay = await dataOf(RefundResult, '/refunds/execute', args);
  expect(replay.refundId).toBe(result.refundId);
  expect(allMockOrders().find((o) => o.id === 'ord_1041')!.refunded).toBe(10);
  expect(result.return).toBeUndefined();
  expect(result.amount.formatted).toBe(quote.amount.formatted);
});
it('refuses expired and changed quotes without moving money', async () => {
  const headers = await admin();
  const input = { target: { kind: 'order', id: 'ord_1041' }, amount: 10 };
  let quote = await dataOf(RefundPreview, '/refunds/preview', {
    headers,
    method: 'POST',
    body: input,
  });
  expireMockRefundQuotes();
  let failure = await refusalOf(409, 'CONFLICT', '/refunds/execute', {
    headers: keyed(headers, key()),
    method: 'POST',
    body: { preview: input, previewToken: quote.token },
  });
  expect(failure.reason).toBe('REFUND_PREVIEW_EXPIRED');
  quote = await dataOf(RefundPreview, '/refunds/preview', { headers, method: 'POST', body: input });
  changeMockOrder('ord_1041', (o) => {
    o.updatedAt = 'changed-version';
  });
  failure = await refusalOf(409, 'CONFLICT', '/refunds/execute', {
    headers: keyed(headers, key()),
    method: 'POST',
    body: { preview: input, previewToken: quote.token },
  });
  expect(failure.reason).toBe('REFUND_PREVIEW_CHANGED');
  expect(allMockOrders().find((o) => o.id === 'ord_1041')!.refunded ?? 0).toBe(0);
});
it.each(['processing', 'manual_required', 'failed', 'succeeded'] as const)(
  'keeps request success distinct from %s settlement',
  async (status) => {
    const headers = await admin();
    await act(headers, 'ret_store_1', 'approve', {
      approvedItems: [{ index: 0, quantity: 1 }],
      returnMethod: 'no_shipping',
    });
    const input = { target: { kind: 'return', id: 'ret_store_1' } };
    const quote = await dataOf(RefundPreview, '/refunds/preview', {
      headers,
      method: 'POST',
      body: input,
    });
    setNextMockRefundStatus(status);
    const result = await dataOf(RefundResult, '/refunds/execute', {
      headers: keyed(headers, key()),
      method: 'POST',
      body: { preview: input, previewToken: quote.token },
    });
    expect(result.operation.state).toBe('succeeded');
    expect(result.settlementStatus).toBe(status);
    const receipt = await dataOf(RefundResult, `/refunds/${result.refundId}`, { headers });
    expect(receipt.settlementStatus).toBe(status);
    if (status === 'manual_required') {
      expect(receipt.return!.actions).toContain('record_settlement');
      const settled = await act(headers, 'ret_store_1', 'record_settlement', {
        settlement: { method: 'bank', reference: 'bank-proof' },
      });
      expect(settled.return.refundStatus).toBe('succeeded');
    }
  }
);
