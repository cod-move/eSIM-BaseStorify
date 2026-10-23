import { create } from 'zustand';

import { WORKSPACES, type Workspace } from '@/contracts/mobile/biz/v1';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import type { WorkspaceChoice } from './resolve-workspace';

/**
 * The workspace an operator with two chose, kept on the device so the app
 * opens in it next time. It is kept with the person's id: whoever signs in
 * next on the same phone is asked again.
 */
type WorkspaceStore = {
  choice: WorkspaceChoice | null;
  /**
   * Works in `workspace` from now on. What was cached from the other one
   * (orders, products, figures …) is thrown away by `useWorkspaceSync`.
   */
  chooseWorkspace: (userId: string, workspace: Workspace) => void;
};

function read(): WorkspaceChoice | null {
  try {
    const saved = JSON.parse(storage.get(STORAGE_KEYS.workspace) ?? 'null');
    if (
      typeof saved?.userId === 'string' &&
      (WORKSPACES as readonly unknown[]).includes(saved.workspace)
    ) {
      return { userId: saved.userId, workspace: saved.workspace };
    }
  } catch {
    // Unreadable: nothing was chosen.
  }
  return null;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  choice: read(),
  chooseWorkspace: (userId, workspace) => {
    const choice = { userId, workspace };
    storage.set(STORAGE_KEYS.workspace, JSON.stringify(choice));
    set({ choice });
  },
}));
