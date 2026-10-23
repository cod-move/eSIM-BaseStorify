/** Endpoints: customers, one customer, and the business's notes about them. */
import {
  CustomerDetail,
  CustomerList,
  CustomerNote,
  CustomerNoteList,
  type CustomerListQuery,
  type CustomerNoteRequest,
  type CustomerNotesQuery,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';
import type { WorkspaceScope } from '../scope';

/** GET /customers: the operator's customers, newest first, a page at a time. */
export function getCustomers(
  { locale, workspace }: WorkspaceScope,
  query: CustomerListQuery,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/customers', query, etag, signal }, CustomerList);
}

/** GET /customers/{id}: one out of the operator's reach answers 404. */
export function getCustomer(
  { locale, workspace }: WorkspaceScope,
  id: string,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: `/customers/${encodeURIComponent(id)}`, etag, signal },
    CustomerDetail
  );
}

/** GET /customers/{id}/notes: the business's notes, newest first, a page at a time. */
export function getCustomerNotes(
  { locale, workspace }: WorkspaceScope,
  id: string,
  query: CustomerNotesQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    {
      locale,
      workspace,
      path: `/customers/${encodeURIComponent(id)}/notes`,
      query,
      etag,
      signal,
    },
    CustomerNoteList
  );
}

/** POST /customers/{id}/notes: a note, written once per key. Answers the note. */
export function postCustomerNote(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: CustomerNoteRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/customers/${encodeURIComponent(id)}/notes`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    CustomerNote
  );
}
