import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { accountScreens } from '@/app-routes/account';
import { browseScreens } from '@/app-routes/browse';
import { checkoutTabScreens } from '@/app-routes/checkout';
import { homeScreens } from '@/app-routes/home';
import { ordersScreens } from '@/app-routes/orders';
import { productScreens } from '@/app-routes/product';
import { searchScreens } from '@/app-routes/search';
import { shoppingScreens } from '@/app-routes/shopping';
import { StackHeader } from '@/components/shell/app-header';
import { STACK_ANIMATION, screenEntrance } from '@/components/ui/motion';
import type { TAB_ROUTES, TabDestination } from '@/config/app-layout';
import { useSession } from '@/features/auth/use-session';

/** Each tab's first screen, by the tab's group. */
const ROOTS = {
  '(1-home)': 'index',
  '(2-search)': 'search',
  '(3-categories)': 'categories',
  '(4-cart)': 'cart',
  '(5-account)': 'account',
} as const satisfies Record<(typeof TAB_ROUTES)[TabDestination], string>;

/**
 * The screen under the one a link opens, so that its back button leads to
 * the tab's first screen. Home's is the default; each other group names its own.
 */
export const unstable_settings = {
  anchor: ROOTS['(1-home)'],
  '2-search': { anchor: ROOTS['(2-search)'] },
  '3-categories': { anchor: ROOTS['(3-categories)'] },
  '4-cart': { anchor: ROOTS['(4-cart)'] },
  '5-account': { anchor: ROOTS['(5-account)'] },
};

/**
 * The stack of each tab, one per group of the folder's name. The tab's first
 * screen is its own (`(1-home)/index.tsx`); every screen in this folder is
 * shared: opened from a tab, it is pushed on that tab's stack, under the bar.
 * The screens that need a title or a session are listed by their area in
 * `src/app-routes/<area>.tsx`; the root stack keeps the sheets and the screens
 * that hide the bar.
 */
export default function TabStackLayout({ segment }: { segment: string }) {
  const t = useTranslations();
  const { isSignedIn } = useSession();
  const root = Object.entries(ROOTS).find(([group]) => group === segment)?.[1];

  return (
    <Stack
      screenOptions={{ ...STACK_ANIMATION, header: (props) => <StackHeader {...props} /> }}
      screenLayout={screenEntrance}>
      {root ? <Stack.Screen name={root} options={{ headerBackVisible: false }} /> : null}
      {accountScreens({ t, isSignedIn })}
      {browseScreens({ t, isSignedIn })}
      {checkoutTabScreens({ t, isSignedIn })}
      {homeScreens({ t, isSignedIn })}
      {ordersScreens({ t, isSignedIn })}
      {productScreens({ t, isSignedIn })}
      {searchScreens({ t, isSignedIn })}
      {shoppingScreens({ t, isSignedIn })}
    </Stack>
  );
}
