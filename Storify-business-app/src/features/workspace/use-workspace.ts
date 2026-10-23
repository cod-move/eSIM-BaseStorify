import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import type { Capability, Me, Workspace } from '@/contracts/mobile/biz/v1';
import { useLocale, useLocaleStore } from '@/i18n/locale-store';

import { resolveWorkspace, type WorkspaceState } from './resolve-workspace';
import { useMe } from './use-me';
import { useWorkspaceStore } from './workspace-store';

/**
 * Where the operator works now (see `WorkspaceState`), and the way to choose
 * or switch. Switching throws away everything cached from the other workspace.
 */
export function useWorkspace(): WorkspaceState & {
  chooseWorkspace: (workspace: Workspace) => void;
} {
  const me = useMe();
  const choice = useWorkspaceStore((store) => store.choice);
  const choose = useWorkspaceStore((store) => store.chooseWorkspace);
  const userId = me.data?.id;

  const state = useMemo(() => resolveWorkspace(me.data, choice), [me.data, choice]);
  const chooseWorkspace = useCallback(
    (workspace: Workspace) => {
      if (userId) choose(userId, workspace);
    },
    [userId, choose]
  );

  return { ...state, chooseWorkspace };
}

/**
 * Where the operator works now, as `useWorkspace` works it out, for what runs
 * outside a screen: an answer that arrives after a switch, with the screen
 * that asked gone. `null` while no workspace is open.
 */
export function currentWorkspace(queryClient: QueryClient): Workspace | null {
  const me = queryClient.getQueryData<Me>(queryKeys.me(useLocaleStore.getState().locale));
  const state = resolveWorkspace(me, useWorkspaceStore.getState().choice);
  return state.status === 'ready' ? state.workspace : null;
}

/**
 * The language and workspace every workspace hook asks in: `null` until the
 * workspace is known, and a hook given `null` does not ask.
 */
export function useWorkspaceScope(): WorkspaceScope | null {
  const locale = useLocale();
  const state = useWorkspace();
  const workspace = state.status === 'ready' ? state.workspace : null;
  return useMemo(() => (workspace ? { locale, workspace } : null), [locale, workspace]);
}

/**
 * Whether the operator may do this in their workspace now. A tab, a tile or a
 * button without its capability stays hidden; the API refuses anyway.
 */
export function useCan(capability: Capability): boolean {
  const state = useWorkspace();
  return state.status === 'ready' && state.access.capabilities.includes(capability);
}
