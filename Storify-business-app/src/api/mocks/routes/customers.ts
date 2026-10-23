/**
 * Customers: the list, one customer, and the business's notes about them.
 *
 * Who is whose follows the API: the store's operators see every customer; a
 * seller and their staff see the customers of the orders in their reach, and,
 * with the inbox, the accounts that wrote to them. A customer's figures count
 * those orders only (`customerOrderFigures`). Notes belong to the business
 * that wrote them: the store's, or one seller's.
 */
import {
  CUSTOMER_NOTE_MAX_LENGTH,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerNote,
} from '@/contracts/mobile/biz/v1';

import type { MockGrant } from '../fixtures/accounts';
import {
  MOCK_CUSTOMERS,
  customerById,
  seedCustomerNotes,
  type MockCustomer,
  type MockCustomerNote,
} from '../fixtures/customers';
import { money, notFound, pageOf, searchOf } from '../fixtures/shared';
import {
  accountOf,
  bodyOf,
  grantOf,
  invalid,
  requireCapability,
  type MockContext,
  type MockRoute,
} from '../kit';
import { scopeOf } from '../scope';

import { conversationsInScope } from './inbox';
import { customerOrderFigures, customerOrders } from './orders';

let notes = seedCustomerNotes();

export function reset(): void {
  notes = seedCustomerNotes();
}

/** Whether the customer is among the operator's. */
function reaches(grant: MockGrant, customer: MockCustomer): boolean {
  const scope = scopeOf(grant);
  if (scope.kind === 'store') return true;
  if (customerOrders(scope, customer).length > 0) return true;
  return (
    customer.kind === 'account' &&
    grant.capabilities.includes('VIEW_INBOX') &&
    conversationsInScope(scope).some(
      (conversation) => conversation.contact.email === customer.email
    )
  );
}

/** The customer of the path, among the operator's; 404 otherwise. */
function customerOf(ctx: MockContext, id: string): MockCustomer {
  const customer = customerById(id);
  if (!customer || !reaches(grantOf(ctx), customer)) throw notFound('Customer');
  return customer;
}

const contact = (customer: MockCustomer) => ({
  ...(customer.email ? { email: customer.email } : {}),
  ...(customer.phone ? { phone: customer.phone } : {}),
  ...(customer.imageUrl ? { imageUrl: customer.imageUrl } : {}),
});

function listItemOf(ctx: MockContext, customer: MockCustomer): CustomerListItem {
  return {
    id: customer.id,
    kind: customer.kind,
    name: customer.name,
    ...contact(customer),
    orderCount: customerOrders(scopeOf(grantOf(ctx)), customer).length,
  };
}

function detailOf(ctx: MockContext, customer: MockCustomer): CustomerDetail {
  const scope = scopeOf(grantOf(ctx));
  const figures = customerOrderFigures(scope, customer);
  // The store's record for the store's operators, the latest order in reach otherwise.
  const addresses =
    scope.kind === 'store'
      ? customer.addresses
      : figures.latestAddress
        ? [figures.latestAddress]
        : [];
  return {
    id: customer.id,
    kind: customer.kind,
    name: customer.name,
    ...contact(customer),
    addresses,
    summary: {
      orderCount: figures.orderCount,
      totalSpent: figures.spent > 0 ? [money(figures.spent, ctx.locale)] : [],
      ...(figures.firstOrderAt ? { firstOrderAt: figures.firstOrderAt } : {}),
      ...(figures.lastOrderAt ? { lastOrderAt: figures.lastOrderAt } : {}),
    },
  };
}

/** Whose notes: the store's team's, or the seller's. */
const businessOf = (grant: MockGrant) =>
  grant.workspace === 'platform' ? 'platform' : (grant.vendorId ?? '');

const noteOf = (note: MockCustomerNote): CustomerNote => ({
  id: note.id,
  body: note.body,
  createdAt: note.createdAt,
  author: note.author,
});

/** Notes need seeing the customer as well as the notes' own capability. */
function authorizeNotes(ctx: MockContext): MockCustomer {
  requireCapability(ctx, 'VIEW_ORDER_CUSTOMERS');
  const id = /^\/customers\/([^/]+)\/notes$/.exec(ctx.path)?.[1] ?? '';
  return customerOf(ctx, id);
}

const NOTES_PATH = /^\/customers\/([^/]+)\/notes$/;

export const routes: readonly MockRoute[] = [
  {
    method: 'GET',
    path: '/customers',
    access: { capability: 'VIEW_ORDER_CUSTOMERS' },
    handle: (ctx) => {
      const grant = grantOf(ctx);
      const search = searchOf(ctx.query);
      const rows = [...MOCK_CUSTOMERS]
        .sort((a, b) => b.since.localeCompare(a.since))
        .filter(
          (customer) =>
            reaches(grant, customer) &&
            (!search ||
              [customer.name, customer.email, customer.phone].some((field) =>
                field?.toLowerCase().includes(search)
              ))
        );
      const page = pageOf(rows, ctx.query);
      return { ...page, items: page.items.map((customer) => listItemOf(ctx, customer)) };
    },
  },
  {
    method: 'GET',
    path: NOTES_PATH,
    access: { capability: 'MANAGE_CUSTOMER_NOTES' },
    handle: (ctx) => {
      const customer = authorizeNotes(ctx);
      const business = businessOf(grantOf(ctx));
      const rows = notes
        .filter((note) => note.business === business && note.customerId === customer.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = pageOf(rows, ctx.query);
      return { ...page, items: page.items.map(noteOf) };
    },
  },
  {
    method: 'POST',
    path: NOTES_PATH,
    access: { capability: 'MANAGE_CUSTOMER_NOTES' },
    idempotent: true,
    authorize: authorizeNotes,
    handle: (ctx) => {
      const customer = authorizeNotes(ctx);
      const grant = grantOf(ctx);
      const raw = bodyOf(ctx).body;
      const body = typeof raw === 'string' ? raw.trim() : '';
      if (!body) throw invalid('body', 'Write the note.');
      if (body.length > CUSTOMER_NOTE_MAX_LENGTH) {
        throw invalid('body', `Notes are ${CUSTOMER_NOTE_MAX_LENGTH} characters at most.`);
      }
      const account = accountOf(ctx);
      const note: MockCustomerNote = {
        id: `note_${notes.length + 1}_${Date.now().toString(36)}`,
        business: businessOf(grant),
        customerId: customer.id,
        body,
        createdAt: new Date().toISOString(),
        author: { name: account.name, role: grant.role },
        by: account.id,
      };
      notes = [...notes, note];
      return noteOf(note);
    },
  },
  {
    method: 'GET',
    path: /^\/customers\/([^/]+)$/,
    access: { capability: 'VIEW_ORDER_CUSTOMERS' },
    handle: (ctx, [id = '']) => detailOf(ctx, customerOf(ctx, id)),
  },
];

/** For tests: the notes the store keeps, every business's. */
export function mockCustomerNotes(): readonly MockCustomerNote[] {
  return notes;
}
