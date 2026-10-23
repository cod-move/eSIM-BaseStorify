/**
 * The mock store's customers: shopper accounts, and guests the store keeps a
 * record for (`guest:` ids). An order or a conversation is a customer's when
 * it carries their email: the store links them by account, or by the email a
 * guest checked out with. Which of them an operator sees, and their figures,
 * is `routes/customers.ts`.
 *
 * Between them:
 * - Amina Customer: an account with a saved address and no orders yet.
 * - Rina Begum: an account with a picture; her paid order #1041 is split
 *   between the store and Green Leaf Goods, so the seller's figures are their
 *   part only; she wrote to the store.
 * - Omar Faruk: Green Leaf's customer, who wrote to Green Leaf too.
 * - Shirin Akter, Mehedi Hasan: guests of Green Leaf's.
 * - Tanvir Hossain, Sabbir Rahman: Urban Thread's customers, out of Green
 *   Leaf's reach.
 * - Laila Ahmed: a regular of the store's own goods, several orders.
 */
import type { CustomerNoteAuthor, OrderAddress } from '@/contracts/mobile/biz/v1';

import { daysAgo, hoursAgo } from './shared';

export type MockCustomer = {
  id: string;
  kind: 'account' | 'guest';
  name: string;
  email: string;
  phone?: string;
  imageUrl?: string;
  /** The store's record: an account's saved addresses, a guest's last one. */
  addresses: OrderAddress[];
  /** When the store first kept their record: the list is newest first. */
  since: string;
};

const address = (name: string, street: string, city: string, phone?: string): OrderAddress => ({
  name,
  street,
  city,
  postalCode: '1207',
  country: 'BD',
  ...(phone ? { phone } : {}),
});

export const MOCK_CUSTOMERS: readonly MockCustomer[] = [
  {
    id: 'cus_amina',
    kind: 'account',
    name: 'Amina Customer',
    email: 'amina.customer@example.com',
    phone: '+8801700000001',
    addresses: [address('Amina Customer', '12 Lake Road', 'Dhaka', '+8801700000001')],
    since: daysAgo(1),
  },
  {
    id: 'cus_rina',
    kind: 'account',
    name: 'Rina Begum',
    email: 'rina@example.com',
    phone: '+8801711000002',
    imageUrl: 'https://picsum.photos/seed/rina/160',
    addresses: [
      address('Rina Begum', 'Flat 4B, 23 Lake Road', 'Dhaka', '+8801711000002'),
      address('Rina Begum', '8 Office Lane', 'Dhaka'),
    ],
    since: daysAgo(2),
  },
  {
    id: 'cus_karim',
    kind: 'account',
    name: 'Karim Uddin',
    email: 'karim@example.com',
    phone: '+8801711000001',
    addresses: [address('Karim Uddin', 'House 12, Road 5', 'Dhaka', '+8801711000001')],
    since: daysAgo(3),
  },
  {
    id: 'cus_omar',
    kind: 'account',
    name: 'Omar Faruk',
    email: 'omar@example.com',
    phone: '+8801711000003',
    addresses: [],
    since: daysAgo(5),
  },
  {
    id: 'guest:cpr_shirin',
    kind: 'guest',
    name: 'Shirin Akter',
    email: 'shirin@example.com',
    addresses: [],
    since: daysAgo(6),
  },
  {
    id: 'guest:cpr_tanvir',
    kind: 'guest',
    name: 'Tanvir Hossain',
    email: 'tanvir@example.com',
    addresses: [],
    since: daysAgo(10),
  },
  {
    id: 'guest:cpr_mehedi',
    kind: 'guest',
    name: 'Mehedi Hasan',
    email: 'mehedi@example.com',
    addresses: [],
    since: daysAgo(15),
  },
  {
    id: 'guest:cpr_sabbir',
    kind: 'guest',
    name: 'Sabbir Rahman',
    email: 'sabbir@example.com',
    addresses: [],
    since: daysAgo(35),
  },
  {
    id: 'cus_laila',
    kind: 'account',
    name: 'Laila Ahmed',
    email: 'laila@example.com',
    addresses: [address('Laila Ahmed', '27 Lake Circus', 'Dhaka', '+8801711000099')],
    since: daysAgo(120),
  },
];

export function customerByEmail(email: string | undefined): MockCustomer | undefined {
  if (!email) return undefined;
  const wanted = email.toLowerCase();
  return MOCK_CUSTOMERS.find((customer) => customer.email === wanted);
}

export function customerById(id: string): MockCustomer | undefined {
  return MOCK_CUSTOMERS.find((customer) => customer.id === id);
}

/** A business note: `business` is `platform`, or the seller's vendor id. */
export type MockCustomerNote = {
  id: string;
  business: string;
  customerId: string;
  body: string;
  createdAt: string;
  author: CustomerNoteAuthor;
  /** The account that wrote it, and the tap's key (one note per tap). */
  by?: string;
  key?: string;
};

/** A fresh copy of the notes: the store's on Rina, and Green Leaf's on Rina and Omar. */
export function seedCustomerNotes(): MockCustomerNote[] {
  return [
    {
      id: 'note_store_rina',
      business: 'platform',
      customerId: 'cus_rina',
      body: 'Prefers delivery after 6 pm. Offer gift wrap on vases.',
      createdAt: daysAgo(3),
      author: { name: 'Amina Rahman', role: 'admin' },
    },
    {
      id: 'note_green_rina',
      business: 'vendor_green',
      customerId: 'cus_rina',
      body: 'Buys candles for her shop. Ask before sending a substitute.',
      createdAt: hoursAgo(20),
      author: { name: 'Nadia Chowdhury', role: 'vendor' },
    },
    {
      id: 'note_green_omar',
      business: 'vendor_green',
      customerId: 'cus_omar',
      body: 'Moved to Chattogram: check the address on every order.',
      createdAt: hoursAgo(1),
      author: { name: 'Rafi Ahmed', role: 'staff' },
    },
  ];
}
