/** Endpoints: sellers' applications to open a shop. Administrators only. */
import {
  VendorApplicationDecisionResult,
  VendorApplicationDetail,
  VendorApplicationList,
  type VendorApplicationDecisionRequest,
  type VendorApplicationListQuery,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';
import type { WorkspaceScope } from '../scope';

/** GET /vendor-applications: a page of a tab (`pending` by default, the longest waiting first). */
export function getVendorApplications(
  { locale, workspace }: WorkspaceScope,
  query: VendorApplicationListQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: '/vendor-applications', query, etag, signal },
    VendorApplicationList
  );
}

/** GET /vendor-applications/{id}, with its documents' links (they expire within minutes). */
export function getVendorApplication(
  { locale, workspace }: WorkspaceScope,
  id: string,
  signal?: AbortSignal
) {
  return api.data(
    { locale, workspace, path: `/vendor-applications/${encodeURIComponent(id)}`, signal },
    VendorApplicationDetail
  );
}

/** POST /vendor-applications/{id}/decision: approve, or reject with a reason; once per key. */
export function decideVendorApplication(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: VendorApplicationDecisionRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/vendor-applications/${encodeURIComponent(id)}/decision`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    VendorApplicationDecisionResult
  );
}
