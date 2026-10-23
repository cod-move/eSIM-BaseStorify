import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

export const homeKeys = {
  home: (scope: WorkspaceScope | null) => [...inWorkspace(scope, 'home'), scope?.locale] as const,
};
