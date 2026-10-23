import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

export const operationsKeys = {
  operation: (scope: WorkspaceScope | null, key: string) =>
    [...inWorkspace(scope, 'operations'), key, scope?.locale] as const,
};
