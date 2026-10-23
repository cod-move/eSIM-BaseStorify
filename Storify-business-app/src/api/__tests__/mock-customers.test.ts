import {
  ConversationList,
  CustomerDetail,
  CustomerList,
  CustomerNote,
  CustomerNoteList,
  OrderDetail,
  OrderList,
} from '@/contracts/mobile/biz/v1';

import { mockCustomerNotes } from '../mocks/routes/customers';
import { resetMockServer } from '../mocks/server';
import { as, call, dataOf, keyed, refusalOf } from './mock-helpers';

beforeEach(resetMockServer);

const names = (list: CustomerList) => list.items.map((customer) => customer.name);

describe('the customers', () => {
  it("lists every customer for the store's operators, newest first, with their orders", async () => {
    const list = await dataOf(CustomerList, '/customers', {
      headers: await as('admin@example.com'),
    });
    expect(names(list)).toEqual([
      'Amina Customer',
      'Rina Begum',
      'Karim Uddin',
      'Omar Faruk',
      'Shirin Akter',
      'Tanvir Hossain',
      'Mehedi Hasan',
      'Sabbir Rahman',
      'Laila Ahmed',
    ]);
    expect(list.items[1]).toEqual({
      id: 'cus_rina',
      kind: 'account',
      name: 'Rina Begum',
      email: 'rina@example.com',
      phone: '+8801711000002',
      imageUrl: 'https://picsum.photos/seed/rina/160',
      orderCount: 1,
    });
    expect(list.items.find((customer) => customer.name === 'Laila Ahmed')?.orderCount).toBe(3);
  });

  it("shows a seller only the customers of their orders, and their staff those of their seller's whole orders", async () => {
    const seller = await dataOf(CustomerList, '/customers', {
      headers: await as('seller@example.com'),
    });
    expect(names(seller)).toEqual([
      'Rina Begum',
      'Karim Uddin',
      'Omar Faruk',
      'Shirin Akter',
      'Mehedi Hasan',
    ]);
    const staff = await dataOf(CustomerList, '/customers', {
      headers: await as('seller-staff@example.com'),
    });
    expect(names(staff)).toEqual(['Omar Faruk', 'Shirin Akter', 'Mehedi Hasan']);
    await refusalOf(403, 'AUTHORIZATION_ERROR', '/customers', {
      headers: await as('staff@example.com'),
    });
  });

  it('searches names, emails and phone numbers, and pages', async () => {
    const headers = await as('admin@example.com');
    expect(names(await dataOf(CustomerList, '/customers?search=RINA', { headers }))).toEqual([
      'Rina Begum',
    ]);
    expect(names(await dataOf(CustomerList, '/customers?search=1711000001', { headers }))).toEqual([
      'Karim Uddin',
    ]);
    const first = await dataOf(CustomerList, '/customers?limit=5', { headers });
    const second = await dataOf(CustomerList, `/customers?limit=5&cursor=${first.nextCursor}`, {
      headers,
    });
    expect(second.items).toHaveLength(4);
    expect(second.nextCursor).toBeNull();
  });

  it("counts a seller's part only, and gives them the address of their latest order", async () => {
    const store = await dataOf(CustomerDetail, '/customers/cus_rina', {
      headers: await as('admin@example.com'),
    });
    expect(store.summary).toMatchObject({
      orderCount: 1,
      totalSpent: [{ amount: 53.45, currency: 'USD', formatted: '$53.45' }],
    });
    expect(store.addresses).toHaveLength(2);

    const seller = await dataOf(CustomerDetail, '/customers/cus_rina', {
      headers: await as('seller@example.com'),
    });
    expect(seller.summary.totalSpent).toEqual([
      { amount: 25, currency: 'USD', formatted: '$25.00' },
    ]);
    expect(seller.addresses.map((address) => address.street)).toEqual(['Flat 4B, 23 Lake Road']);

    const guest = await dataOf(
      CustomerDetail,
      `/customers/${encodeURIComponent('guest:cpr_shirin')}`,
      {
        headers: await as('seller@example.com'),
      }
    );
    expect(guest).toMatchObject({ kind: 'guest', summary: { orderCount: 1 } });
  });

  it("refuses a customer out of the operator's reach as not found", async () => {
    const headers = await as('seller@example.com');
    await refusalOf(404, 'NOT_FOUND', '/customers/guest:cpr_tanvir', { headers });
    await refusalOf(404, 'NOT_FOUND', '/customers/cus_laila', { headers });
    await refusalOf(404, 'NOT_FOUND', '/customers/cus_nobody', { headers });
  });
});

describe('notes', () => {
  it("keeps the store's notes and each seller's apart", async () => {
    const store = await dataOf(CustomerNoteList, '/customers/cus_rina/notes', {
      headers: await as('admin@example.com'),
    });
    expect(store.items.map((note) => note.id)).toEqual(['note_store_rina']);
    const seller = await dataOf(CustomerNoteList, '/customers/cus_rina/notes', {
      headers: await as('seller@example.com'),
    });
    expect(seller.items.map((note) => note.id)).toEqual(['note_green_rina']);
    expect(seller.items[0]?.author).toEqual({ name: 'Nadia Chowdhury', role: 'vendor' });
  });

  it("refuses notes to staff without the permission, and about another seller's customer", async () => {
    await refusalOf(403, 'AUTHORIZATION_ERROR', '/customers/cus_omar/notes', {
      headers: await as('seller-staff@example.com'),
    });
    const seller = await as('seller@example.com');
    await refusalOf(404, 'NOT_FOUND', '/customers/guest:cpr_tanvir/notes', { headers: seller });
    await refusalOf(404, 'NOT_FOUND', '/customers/guest:cpr_tanvir/notes', {
      method: 'POST',
      headers: keyed(seller, 'key-tanvir'),
      body: { body: 'Not ours' },
    });
  });

  it('writes a note once per key, under the business that wrote it', async () => {
    const headers = keyed(await as('seller@example.com'), 'key-1');
    const write = () =>
      call('/customers/cus_omar/notes', {
        method: 'POST',
        headers,
        body: { body: '  Call first  ' },
      });
    const first = await write();
    const again = await write();
    expect(first.response.status).toBe(200);
    const note = CustomerNote.parse(first.body.data);
    expect(note).toMatchObject({
      body: 'Call first',
      author: { name: 'Nadia Chowdhury', role: 'vendor' },
    });
    expect(again.body.data.id).toBe(note.id);
    expect(mockCustomerNotes().filter((item) => item.body === 'Call first')).toEqual([
      expect.objectContaining({ business: 'vendor_green', customerId: 'cus_omar' }),
    ]);

    const empty = await refusalOf(400, 'VALIDATION_ERROR', '/customers/cus_omar/notes', {
      method: 'POST',
      headers: keyed(headers, 'key-2'),
      body: { body: '   ' },
    });
    expect(empty.errors).toHaveProperty('body');
    await refusalOf(400, 'VALIDATION_ERROR', '/customers/cus_omar/notes', {
      method: 'POST',
      headers: keyed(headers, 'key-3'),
      body: { body: 'x'.repeat(2001) },
    });
  });
});

describe("a customer's orders and conversations", () => {
  it('filters the orders by customer, within the scope', async () => {
    const admin = await as('admin@example.com');
    const seller = await as('seller@example.com');
    const ids = async (query: string, headers: Record<string, string>) =>
      (await dataOf(OrderList, `/orders?${query}`, { headers })).items.map((order) => order.id);
    expect(await ids('customerId=cus_laila', admin)).toEqual(['ord_1027', 'ord_1022', 'ord_1017']);
    expect(await ids('customerId=cus_laila', seller)).toEqual([]);
    expect(await ids('customerId=cus_rina', seller)).toEqual(['ord_1041']);
    expect(await ids('customerId=cus_nobody', admin)).toEqual([]);
  });

  it('names the customer of an order and of a conversation for whoever may see customers', async () => {
    const admin = await as('admin@example.com');
    const order = await dataOf(OrderDetail, '/orders/ord_1041', { headers: admin });
    expect(order.customer.id).toBe('cus_rina');
    const walkIn = await dataOf(OrderDetail, '/orders/ord_1034', { headers: admin });
    expect(walkIn.customer).toEqual({});
    const staff = await dataOf(OrderDetail, '/orders/ord_1041', {
      headers: await as('staff@example.com'),
    });
    expect(staff.customer.id).toBeUndefined();

    const inbox = await dataOf(ConversationList, '/conversations', { headers: admin });
    const byId = Object.fromEntries(inbox.items.map((item) => [item.id, item.customerId ?? null]));
    expect(byId).toMatchObject({
      conv_store_1: 'cus_rina',
      conv_store_2: null,
      conv_store_3: 'guest:cpr_mehedi',
    });
    const rina = await dataOf(ConversationList, '/conversations?customerId=cus_rina', {
      headers: admin,
    });
    expect(rina.items.map((item) => item.id)).toEqual(['conv_store_1']);

    const seller = await dataOf(ConversationList, '/conversations', {
      headers: await as('seller@example.com'),
    });
    expect(seller.items.find((item) => item.id === 'conv_green_1')?.customerId).toBe('cus_omar');
  });
});
