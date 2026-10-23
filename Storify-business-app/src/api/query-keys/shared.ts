import type { WorkspaceScope } from '../scope';

/**
 * The start of every key of a workspace's data. A key made while there is no
 * workspace yet (`scope` is `null`) belongs to a query that does not run: its
 * hook passes `skipToken`.
 */
export function inWorkspace(scope: WorkspaceScope | null, area: string) {
  return ['private', 'workspace', scope?.workspace ?? null, area] as const;
}
