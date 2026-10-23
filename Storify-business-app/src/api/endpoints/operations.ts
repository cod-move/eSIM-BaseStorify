import { OperationStatus } from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { WorkspaceScope } from '../scope';

/** Reconcile the original tap under its workspace and current resource grants. */
export function getOperation(
  { locale, workspace }: WorkspaceScope,
  key: string,
  signal?: AbortSignal
) {
  return api.data(
    { locale, workspace, path: '/operations', query: { key }, signal },
    OperationStatus
  );
}
