import {
  ManualOrderCreateResult,
  ManualOrderFormOptions,
  ManualOrderQuote,
  OrderContactCreateResult,
  OrderCustomerSelectors,
  OrderProductSelectors,
  OperationStatus,
  type ManualOrderDraftRequest,
} from '@/contracts/mobile/biz/v1';
import { allMockOrders } from '../mocks/routes/orders';
import { allMockProducts, changeMockProduct } from '../mocks/routes/products';
import { allMockOrderContacts, expireMockManualQuotes } from '../mocks/routes/order-creation';
import { resetMockServer } from '../mocks/server';
import { as, dataOf, keyed, refusalOf } from './mock-helpers';

const KEY = '37bf2937-79cd-4563-987b-b698a3beab35';
const draft: ManualOrderDraftRequest = {
  draftId: '4c5415e0-cb21-4850-86d6-a6eb60083117',
  customer: { kind: 'guest', name: 'Mobile Guest', email: 'guest@example.com' },
  items: [{ productId: 'prod_vase', quantity: 2 }],
  locationId: 'loc_main',
  deliveryId: 'pickup:loc_main',
  paymentMethod: 'manual_pending',
};
beforeEach(resetMockServer);
async function quoted(headers: Record<string, string>, input = draft) {
  return dataOf(ManualOrderQuote, '/orders/creation/quote', {
    headers,
    method: 'POST',
    body: input,
  });
}
async function refusalWithReason(
  status: number,
  code: string,
  path: string,
  init: Parameters<typeof refusalOf>[3],
  reason: string
) {
  const body = await refusalOf(status, code, path, init);
  expect(body.reason).toBe(reason);
}

it('offers scoped locations/products and permitted payment recording, denying read-only operators', async () => {
  const seller = await as('seller@example.com', 'vendor');
  const options = await dataOf(ManualOrderFormOptions, '/orders/creation/options', {
    headers: seller,
  });
  expect(options.locations.map((item) => item.id)).toEqual(['loc_green']);
  expect(options.customerModes).not.toContain('create_contact');
  const products = await dataOf(OrderProductSelectors, '/orders/creation/products?limit=1', {
    headers: seller,
  });
  expect(products.items).toHaveLength(1);
  expect(products.nextCursor).not.toBeNull();
  expect(products.items.some((item) => item.id === 'prod_vase')).toBe(false);
  await refusalOf(403, 'AUTHORIZATION_ERROR', '/orders/creation/options', {
    headers: await as('staff@example.com', 'platform'),
  });
});

it('quotes canonical totals and replays one order, stock reservation and pending payment', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const before = allMockOrders().length;
  const quote = await quoted(headers);
  const input = { draft, quoteToken: quote.token };
  const result = await dataOf(ManualOrderCreateResult, '/orders/creation', {
    headers,
    method: 'POST',
    body: input,
  });
  const replay = await dataOf(ManualOrderCreateResult, '/orders/creation', {
    headers,
    method: 'POST',
    body: input,
  });
  expect(replay.order.id).toBe(result.order.id);
  expect(allMockOrders()).toHaveLength(before + 1);
  expect(result.order.paymentStatus).toBe('pending');
  expect(result.order.totals.total.formatted).toBe(quote.totals.total.formatted);
  expect(allMockProducts().find((item) => item.id === 'prod_vase')!.stock.loc_main).toMatchObject({
    available: 16,
    committed: 4,
  });
  const receipt = await dataOf(OperationStatus, `/operations?key=${KEY}`, { headers });
  expect(receipt.resources).toEqual([{ kind: 'order', id: result.order.id }]);
});

it('a method selection does not imply payment; explicit recording uses the offered grant', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const paidDraft = { ...draft, paymentMethod: 'cash' };
  const quote = await quoted(headers, paidDraft);
  const result = await dataOf(ManualOrderCreateResult, '/orders/creation', {
    headers,
    method: 'POST',
    body: {
      draft: paidDraft,
      quoteToken: quote.token,
      recordPayment: { reference: 'Cash received' },
    },
  });
  expect(result.order.paymentStatus).toBe('paid');
  expect(result.order.actions).not.toContain('cancel');
});

it('refuses expired, changed and altered quotes before creating or reserving stock', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const before = allMockOrders().length;
  const quote = await quoted(headers);
  changeMockProduct('prod_vase', (product) => {
    product.price = 29;
  });
  await refusalWithReason(
    409,
    'CONFLICT',
    '/orders/creation',
    { headers, method: 'POST', body: { draft, quoteToken: quote.token } },
    'QUOTE_CHANGED'
  );
  const changed = await quoted(headers);
  expireMockManualQuotes();
  await refusalWithReason(
    409,
    'CONFLICT',
    '/orders/creation',
    {
      headers: keyed(headers, 'f853144a-76ba-4bc8-9f14-c9c8c55f2b70'),
      method: 'POST',
      body: { draft, quoteToken: changed.token },
    },
    'QUOTE_EXPIRED'
  );
  expect(allMockOrders()).toHaveLength(before);
  expect(allMockProducts().find((item) => item.id === 'prod_vase')!.stock.loc_main!.available).toBe(
    18
  );
});

it('binds a quote to the creation that used it, and lets a draft make one order', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const other = keyed(headers, 'f853144a-76ba-4bc8-9f14-c9c8c55f2b70');
  const before = allMockOrders().length;
  const quote = await quoted(headers);
  const body = { draft, quoteToken: quote.token };
  // "Payment pending" records no payment: refused after the quote was claimed.
  await refusalWithReason(
    403,
    'AUTHORIZATION_ERROR',
    '/orders/creation',
    { headers, method: 'POST', body: { ...body, recordPayment: {} } },
    'PAYMENT_RECORDING_NOT_ALLOWED'
  );
  // The refused tap holds the quote: another key cannot use it, the tap's own can.
  await refusalWithReason(
    409,
    'CONFLICT',
    '/orders/creation',
    { headers: other, method: 'POST', body },
    'QUOTE_CHANGED'
  );
  const created = await dataOf(ManualOrderCreateResult, '/orders/creation', {
    headers,
    method: 'POST',
    body,
  });
  // A new quote for the same draft, under a new key, is pointed at the order it made.
  const again = await quoted(headers);
  const refused = await refusalOf(409, 'CONFLICT', '/orders/creation', {
    headers: other,
    method: 'POST',
    body: { draft, quoteToken: again.token },
  });
  expect(refused.reason).toBe('OPERATION_RECONCILIATION_REQUIRED');
  expect(OperationStatus.parse(refused.details?.operation)).toMatchObject({
    key: KEY,
    state: 'succeeded',
    resources: [{ kind: 'order', id: created.order.id }],
  });
  expect(allMockOrders()).toHaveLength(before + 1);
});

it('allocates stock itself when no location is chosen', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const shipped = {
    ...draft,
    locationId: undefined,
    deliveryId: 'shipping',
    shippingAddress: { name: 'Mobile Guest', street: '1 Road', city: 'Dhaka', country: 'BD' },
  };
  const quote = await quoted(headers, shipped);
  await dataOf(ManualOrderCreateResult, '/orders/creation', {
    headers,
    method: 'POST',
    body: { draft: shipped, quoteToken: quote.token },
  });
  const vase = allMockProducts().find((item) => item.id === 'prod_vase')!;
  expect(vase.stock.loc_main).toMatchObject({ available: 16, committed: 4 });
  expect(vase.stock.loc_popup!.available).toBe(6);
});

it('refuses an item stock race and unauthorized seller products without partial effects', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const quote = await quoted(headers);
  changeMockProduct('prod_vase', (product) => {
    product.stock.loc_main!.available = 1;
  });
  await refusalWithReason(
    409,
    'CONFLICT',
    '/orders/creation',
    { headers, method: 'POST', body: { draft, quoteToken: quote.token } },
    'INSUFFICIENT_STOCK'
  );
  const seller = await as('seller@example.com', 'vendor');
  await refusalOf(404, 'NOT_FOUND', '/orders/creation/quote', {
    headers: seller,
    method: 'POST',
    body: { ...draft, locationId: 'loc_green', deliveryId: 'pickup:loc_green' },
  });
});

it('selects authorized existing customers and creates guest contacts once without altering an account', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const customers = await dataOf(
    OrderCustomerSelectors,
    '/orders/creation/customers?search=Amina',
    { headers }
  );
  expect(customers.items[0]?.kind).toBe('account');
  await refusalWithReason(
    409,
    'CONFLICT',
    '/orders/creation/contacts',
    {
      headers,
      method: 'POST',
      body: { name: 'Rename account', email: 'amina.customer@example.com' },
    },
    'CONTACT_CREATE_NOT_ALLOWED'
  );
  const body = { name: 'New contact', email: 'new.contact@example.com' };
  const first = await dataOf(OrderContactCreateResult, '/orders/creation/contacts', {
    headers: keyed(headers, '47792c15-2be2-46b8-a1d7-64e07608ac25'),
    method: 'POST',
    body,
  });
  expect(first.customer.kind).toBe('guest');
  const replay = await dataOf(OrderContactCreateResult, '/orders/creation/contacts', {
    headers: keyed(headers, '47792c15-2be2-46b8-a1d7-64e07608ac25'),
    method: 'POST',
    body,
  });
  expect(replay.customer.id).toBe(first.customer.id);
  expect(allMockOrderContacts().filter((item) => item.email === body.email)).toHaveLength(1);
});

it('barcodes identify variants and quantities commit only to the selected stock row', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const product = allMockProducts().find(
    (item) => item.variants.length && item.vendorId === 'vendor_green'
  )!;
  const variant = product.variants[0]!;
  const products = await dataOf(
    OrderProductSelectors,
    `/orders/creation/products?barcode=${encodeURIComponent(variant.barcode ?? variant.sku!)}`,
    { headers }
  );
  expect(products.items.some((item) => item.id === product.id)).toBe(true);
  const input = {
    ...draft,
    items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    locationId: 'loc_green',
    deliveryId: 'pickup:loc_green',
  };
  const before = variant.stock.loc_green!.available;
  const quote = await quoted(headers, input);
  const result = await dataOf(ManualOrderCreateResult, '/orders/creation', {
    headers,
    method: 'POST',
    body: { draft: input, quoteToken: quote.token },
  });
  expect(result.order.lines[0]?.variantId).toBe(variant.id);
  expect(variant.stock.loc_green!.available).toBe(before - 1);
});
