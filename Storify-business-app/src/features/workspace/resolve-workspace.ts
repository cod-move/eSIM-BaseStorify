import type { Me, Workspace, WorkspaceAccess } from '@/contracts/mobile/biz/v1';

/** The workspace an operator chose, remembered for them alone. */
export type WorkspaceChoice = { userId: string; workspace: Workspace };

/**
 * Where the operator works now, from GET /me and the choice they made last:
 *
 * - `loading`: who they are is not known yet.
 * - `none`: they can work nowhere right now (a staff member whose access was
 *   switched off). Say so and offer sign-out.
 * - `choose`: two workspaces and no choice yet (or the one chosen is gone):
 *   ask which, then `chooseWorkspace`.
 * - `ready`: the workspace, and what they may do there (`access.capabilities`
 *   is what the app shows).
 *
 * One workspace opens directly, whatever was chosen before.
 */
export type WorkspaceState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'choose'; workspaces: WorkspaceAccess[] }
  | {
      status: 'ready';
      workspace: Workspace;
      access: WorkspaceAccess;
      workspaces: WorkspaceAccess[];
    };

export function resolveWorkspace(
  me: Me | undefined,
  choice: WorkspaceChoice | null
): WorkspaceState {
  if (!me) return { status: 'loading' };
  const { workspaces } = me;
  if (workspaces.length === 0) return { status: 'none' };

  const only = workspaces.length === 1 ? workspaces[0] : undefined;
  const chosen =
    choice?.userId === me.id
      ? workspaces.find((access) => access.workspace === choice.workspace)
      : undefined;
  const access = only ?? chosen;
  if (!access) return { status: 'choose', workspaces };
  return { status: 'ready', workspace: access.workspace, access, workspaces };
}
