import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

export const uploadsKeys = {
  upload: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'uploads'), 'detail', id, scope?.locale] as const,
  uploadAccess: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'uploads'), 'access', id, scope?.locale] as const,
};
