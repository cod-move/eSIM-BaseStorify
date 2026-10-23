import type { CustomerListQuery } from '@/contracts/mobile/biz/v1';

import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

type CustomerFilter = Omit<CustomerListQuery, 'cursor' | 'limit'>;

export const customersKeys = {
  /** Every customer list of the workspace, whatever the search and language. */
  customerLists: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'customers'), 'list'] as const,
  customerList: (scope: WorkspaceScope | null, filter: CustomerFilter) =>
    [...inWorkspace(scope, 'customers'), 'list', scope?.locale, filter] as const,
  customer: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'customers'), 'detail', id, scope?.locale] as const,
  customerNotes: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'customers'), 'notes', id, scope?.locale] as const,
};
