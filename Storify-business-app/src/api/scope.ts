import type { Workspace } from '@/contracts/mobile/biz/v1';

/**
 * Where a request about the store's business goes: the language of the answer
 * (the first part of the path) and the workspace it is for (`X-Workspace`).
 * Every endpoint of a workspace takes one, and every cache key of one carries
 * it, so an answer meant for one workspace is never shown in the other.
 *
 * `features/workspace` gives the current one (`useWorkspaceScope`); it is
 * `null` until the operator's workspace is known.
 */
export type WorkspaceScope = {
  readonly locale: string;
  readonly workspace: Workspace;
};
