import type { PayoutListQuery, PayoutSummaryQuery } from '@/contracts/mobile/biz/v1';

import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

type PayoutFilter = Omit<PayoutListQuery, 'cursor' | 'limit'>;

export const payoutsKeys = {
  /** Everything of the seller's money: the summary in every currency, every list and every payout, in every language. */
  payoutData: (scope: WorkspaceScope | null) => inWorkspace(scope, 'payouts'),
  payoutSummary: (scope: WorkspaceScope | null, query: PayoutSummaryQuery = {}) =>
    [...inWorkspace(scope, 'payouts'), 'summary', scope?.locale, query] as const,
  payoutList: (scope: WorkspaceScope | null, filter: PayoutFilter) =>
    [...inWorkspace(scope, 'payouts'), 'list', scope?.locale, filter] as const,
  payout: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'payouts'), 'detail', id, scope?.locale] as const,
};
