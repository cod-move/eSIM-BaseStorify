/** The shopper's address book. Every change answers with the whole book. */
import {
  AddressRequest,
  AddressUpdateRequest,
  type Address,
  type AddressBook,
} from '@/contracts/mobile/shop/v1';

import { seededAddresses } from '../fixtures/addresses';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';
import { state } from '../state';

/** User id → the book. The first look seeds it. */
const books = new Map<string, Address[]>();

export function reset(): void {
  books.clear();
}

function bookOf(ctx: MockContext): Address[] {
  const user = requireUser(ctx);
  let book = books.get(user.id);
  if (!book) {
    book = seededAddresses();
    books.set(user.id, book);
  }
  return book;
}

function answer(book: Address[]): AddressBook {
  return { items: book.map((address) => ({ ...address })) };
}

function find(book: Address[], id: string): Address {
  const address = book.find((a) => a.id === id);
  if (!address) throw new MockError(404, 'NOT_FOUND', 'No such address');
  return address;
}

function makeDefault(book: Address[], id: string): void {
  for (const address of book) address.isDefault = address.id === id;
}

function refuse(): never {
  throw new MockError(422, 'VALIDATION_ERROR', 'The address is not valid');
}

export const routes: MockRoute[] = [
  { method: 'GET', path: '/addresses', handle: (ctx) => answer(bookOf(ctx)) },
  {
    method: 'POST',
    path: '/addresses',
    handle: (ctx) => {
      const book = bookOf(ctx);
      const parsed = AddressRequest.safeParse(ctx.body);
      if (!parsed.success) refuse();
      const { isDefault, label, ...fields } = parsed.data;
      const address: Address = {
        ...fields,
        id: `addr_${state.nextId++}`,
        label: label ?? 'other',
        isDefault: false,
      };
      book.push(address);
      if (isDefault || book.length === 1) makeDefault(book, address.id);
      return answer(book);
    },
  },
  {
    method: 'PATCH',
    path: /^\/addresses\/([^/]+)$/,
    handle: (ctx, [id = '']) => {
      const book = bookOf(ctx);
      const address = find(book, id);
      const parsed = AddressUpdateRequest.safeParse(ctx.body);
      if (!parsed.success) refuse();
      const { isDefault, ...fields } = parsed.data;
      Object.assign(address, fields);
      if (isDefault) makeDefault(book, id);
      return answer(book);
    },
  },
  {
    method: 'DELETE',
    path: /^\/addresses\/([^/]+)$/,
    handle: (ctx, [id = '']) => {
      const book = bookOf(ctx);
      const address = find(book, id);
      book.splice(book.indexOf(address), 1);
      // There is always exactly one default while the book is not empty.
      const [first] = book;
      if (address.isDefault && first) makeDefault(book, first.id);
      return answer(book);
    },
  },
  {
    method: 'PUT',
    path: /^\/addresses\/([^/]+)\/default$/,
    handle: (ctx, [id = '']) => {
      const book = bookOf(ctx);
      makeDefault(book, find(book, id).id);
      return answer(book);
    },
  },
];
