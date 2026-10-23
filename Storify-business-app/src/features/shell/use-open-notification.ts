import { router, type Href } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import type { Capability, Workspace } from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useConfig } from '@/features/config/use-config';
import { useOpenPage } from '@/features/web/use-open-page';
import { openTab, useSwitchWorkspace } from '@/features/workspace/use-switch-workspace';
import { useWorkspace } from '@/features/workspace/use-workspace';
import { joinWebsiteUrl, notificationTarget, notificationWorkspace } from '@/lib/links';

import { targetRoute } from './notification-routes';
import { TABS } from './tabs';

/** A screen to open once the switch to its workspace has taken effect. */
type PendingOpen = { href: Href; workspace: Workspace; capability: Capability; actor: string };

const usePendingOpen = create<{ pending: PendingOpen | null }>(() => ({ pending: null }));
export const clearPendingNotificationOpen = () => usePendingOpen.setState({ pending: null });

/** The paths of the tabs: `/`, `/orders` … */
const TAB_PATHS: ReadonlySet<string> = new Set(
  TABS.map((tab) => (tab.route === 'index' ? '/' : `/${tab.route}`))
);

/** Whether a notification's screen is one of the tabs. */
function isTab(href: Href): boolean {
  const pathname = typeof href === 'string' ? href.split('?')[0] : href.pathname;
  return pathname !== undefined && TAB_PATHS.has(pathname);
}

/**
 * Opens a notification's screen: a tab by going back to the tabs (closing the
 * screens above them, such as the notifications screen), any other screen on
 * top of the one showing.
 */
function show(href: Href): void {
  if (isTab(href)) openTab(href);
  else router.push(href);
}

/**
 * Opens what a notification is about, whether it
 * was a push the operator tapped or a row of the notifications screen:
 * `notificationTarget` says which screen its dashboard link is; a link the
 * app has no screen for opens on the store's website, inside the app.
 *
 * The link says whose it is (`/vendor/…` the seller's, `/admin/…` and
 * `/staff/…` the store's): for an operator with two workspaces the app
 * switches to that one first, as the workspace sheet does (back to Home, and
 * says so), and opens the screen once the switch has taken effect
 * (`usePendingNotificationOpen`). A screen the operator may not see there
 * opens Home.
 */
export function useOpenNotification(): (link: string, type?: string) => void {
  const state = useWorkspace();
  const { user } = useSession();
  const config = useConfig();
  const switchWorkspace = useSwitchWorkspace();
  const openPage = useOpenPage();
  const websiteUrl = config.data?.store.websiteUrl;

  return useCallback(
    (link, type) => {
      if (state.status !== 'ready') return;
      const target = notificationTarget(link, type);
      if (!target) {
        if (websiteUrl) openPage(joinWebsiteUrl(websiteUrl, link));
        return;
      }

      const { href, capability } = targetRoute(target);
      const workspace = notificationWorkspace(link) ?? state.workspace;
      const access = state.workspaces.find((candidate) => candidate.workspace === workspace);
      if (!access?.capabilities.includes(capability)) {
        openTab('/');
        return;
      }
      if (workspace === state.workspace) {
        show(href);
        return;
      }
      if (!user) return;
      usePendingOpen.setState({ pending: { href, workspace, capability, actor: user.id } });
      switchWorkspace(workspace);
    },
    [state, websiteUrl, switchWorkspace, user, openPage]
  );
}

/**
 * Opens the screen a notification asked for once the switch to its workspace
 * has taken effect: its route exists only then. Mounted once, in the root
 * layout (through `useNotificationOpen`), so it outlives the screen the
 * notification was tapped on.
 *
 * It is dropped when somebody else signs in, when no workspace is open any
 * more, and when GET /me no longer lists the workspace it waits for: that
 * switch would never come, and the screen must not open on a later one.
 */
export function usePendingNotificationOpen(): void {
  const state = useWorkspace();
  const { user, isPending } = useSession();
  const current = state.status === 'ready' ? state.workspace : null;
  const pending = usePendingOpen((store) => store.pending);

  useEffect(() => {
    if (!pending || isPending) return;
    const gone =
      state.status === 'ready' &&
      !state.workspaces.some((access) => access.workspace === pending.workspace);
    if (
      pending.actor !== user?.id ||
      (state.status !== 'loading' && state.status !== 'ready') ||
      gone
    ) {
      clearPendingNotificationOpen();
      return;
    }
    if (current !== pending.workspace) return;
    usePendingOpen.setState({ pending: null });
    const href =
      state.status === 'ready' && state.access.capabilities.includes(pending.capability)
        ? pending.href
        : '/';
    // The switch has closed the screens above the tabs already.
    if (isTab(href)) router.navigate(href);
    else router.push(href);
  }, [pending, current, user?.id, isPending, state]);
}
