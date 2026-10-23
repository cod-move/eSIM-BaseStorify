import type { IconName } from '@/components/ui/icon';
import type { Capability } from '@/contracts/mobile/biz/v1';

/**
 * The five tabs, in order. A tab with a capability shows
 * only when GET /me gives it in the current workspace: its route does not
 * exist otherwise (`Tabs.Protected`), so a link to it opens Home. Home and Account
 * are always there.
 */
export const TABS = [
  { route: 'index', icon: 'home', label: 'home' },
  { route: 'orders', icon: 'shopping-bag', label: 'orders', capability: 'VIEW_ORDERS' },
  { route: 'products', icon: 'package', label: 'products', capability: 'VIEW_PRODUCTS' },
  { route: 'inbox', icon: 'chat', label: 'inbox', capability: 'VIEW_INBOX' },
  { route: 'more', icon: 'user', label: 'account' },
] as const satisfies readonly {
  route: string;
  icon: IconName;
  label: string;
  capability?: Capability;
}[];

/** Whether a tab shows, given the capabilities of the current workspace. */
export function showsTab(tab: (typeof TABS)[number], capabilities: readonly Capability[]): boolean {
  return !('capability' in tab) || capabilities.includes(tab.capability);
}
