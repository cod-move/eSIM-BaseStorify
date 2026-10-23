/** Endpoints: the shopper's address book. Every change answers with the whole book. */
import {
  AddressBook,
  type AddressRequest,
  type AddressUpdateRequest,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';

const path = (id: string) => `/addresses/${encodeURIComponent(id)}`;

export function getAddresses(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/addresses', auth: 'user', signal }, AddressBook);
}

export function createAddress(locale: string, address: AddressRequest) {
  return api.data(
    { locale, path: '/addresses', method: 'POST', body: address, auth: 'user' },
    AddressBook
  );
}

/** Only the fields sent change. */
export function updateAddress(locale: string, id: string, change: AddressUpdateRequest) {
  return api.data(
    { locale, path: path(id), method: 'PATCH', body: change, auth: 'user' },
    AddressBook
  );
}

export function removeAddress(locale: string, id: string) {
  return api.data({ locale, path: path(id), method: 'DELETE', auth: 'user' }, AddressBook);
}

export function setDefaultAddress(locale: string, id: string) {
  return api.data(
    { locale, path: `${path(id)}/default`, method: 'PUT', auth: 'user' },
    AddressBook
  );
}
