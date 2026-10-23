/** Endpoints: a seller's balance and payouts. Read only. */
import {
  PayoutDetail,
  PayoutList,
  PayoutSummary,
  type PayoutListQuery,
  type PayoutSummaryQuery,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';
import type { WorkspaceScope } from '../scope';

/** GET /payouts/summary: in `currency`, else in the store's own. */
export function getPayoutSummary(
  { locale, workspace }: WorkspaceScope,
  query: PayoutSummaryQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: '/payouts/summary', query, etag, signal },
    PayoutSummary
  );
}

/** GET /payouts: a page, newest first. */
export function getPayouts(
  { locale, workspace }: WorkspaceScope,
  query: PayoutListQuery,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/payouts', query, etag, signal }, PayoutList);
}

/** GET /payouts/{id} */
export function getPayout(
  { locale, workspace }: WorkspaceScope,
  id: string,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: `/payouts/${encodeURIComponent(id)}`, etag, signal },
    PayoutDetail
  );
}
