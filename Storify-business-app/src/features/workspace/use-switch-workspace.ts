import { router, type Href } from 'expo-router';
import { useCallback } from 'react';
import { useTranslations } from 'use-intl';

import { useToast } from '@/components/ui/toast';
import type { Workspace } from '@/contracts/mobile/biz/v1';

import { useWorkspace } from './use-workspace';
import { useWorkspaceLabel } from './workspace-label';

/**
 * Opens a tab (Home unless told otherwise), closing every screen stacked
 * above the tabs first. Going to a tab from one of those screens would
 * otherwise stack a second set of tabs on top of them, with the screens
 * underneath still mounted.
 */
export function openTab(href: Href = '/'): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(href);
}

/**
 * Switches to another workspace, as the workspace sheet, More and a
 * notification about the other workspace do: the choice is remembered,
 * everything cached from the old one is thrown away (`useWorkspaceSync`), the
 * tabs follow the new capabilities, the app returns to Home (closing the
 * screens above the tabs, which showed the old workspace's orders and
 * conversations), and a toast says where the operator now works.
 */
export function useSwitchWorkspace(): (workspace: Workspace) => void {
  const t = useTranslations('workspace');
  const state = useWorkspace();
  const label = useWorkspaceLabel();
  const toast = useToast();

  return useCallback(
    (workspace) => {
      if (state.status !== 'ready' || workspace === state.workspace) return;
      const access = state.workspaces.find((candidate) => candidate.workspace === workspace);
      if (!access) return;
      state.chooseWorkspace(workspace);
      openTab('/');
      toast.show({ message: t('switched', { name: label(access).name }), tone: 'success' });
    },
    [state, label, toast, t]
  );
}
