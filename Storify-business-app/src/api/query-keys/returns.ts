import type { ReturnListQuery } from '@/contracts/mobile/biz/v1';
import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';
export const returnsKeys = {
  returnLists: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'returns'), 'list'] as const,
  returnList: (scope: WorkspaceScope | null, filter: Omit<ReturnListQuery, 'cursor'>) =>
    [...inWorkspace(scope, 'returns'), 'list', scope?.locale, filter] as const,
  returnDetail: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'returns'), 'detail', id, scope?.locale] as const,
  returnOptions: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'returns'), 'options', id, scope?.locale] as const,
  refund: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'returns'), 'refund', id, scope?.locale] as const,
};
