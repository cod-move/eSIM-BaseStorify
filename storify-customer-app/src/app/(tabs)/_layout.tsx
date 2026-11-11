import { Tabs } from 'expo-router/js-tabs';
import { useTranslations } from 'use-intl';

import { tabAnimation, useReduceMotion } from '@/components/ui/motion';
import { APP_LAYOUT, TAB_ROUTES } from '@/config/app-layout';
import { useCartCount } from '@/features/cart/use-cart';
import { EsimTabBar } from '@/features/esim/tab-bar'; // [esim-patch] P49 icon above name, every name shown

/**
 * The five tabs. Which of them the bar shows, and in what order, comes from
 * the app's layout (`src/config/app-layout.ts`). Each tab is a group with a
 * stack of its own (`(1-home,…)/_layout.tsx`): a screen opened from a tab is
 * pushed in that tab, under the bar, and the tab keeps its history while the
 * shopper visits another. The bar floats over the screens, which leave room
 * for it at the bottom with `useTabBarHeight()`, and a panel pinned at the
 * foot of one (the cart's and checkout's totals) keeps its content above the
 * bar's fade with `usePinnedPanelPadding()`.
 *
 * The digits put Home's group first: a link that opens the app has no tab to
 * stay in, and Expo Router then picks the first group, by name, that has the
 * screen.
 */
export default function TabsLayout() {
  const t = useTranslations('tabs');
  const tEsim = useTranslations('esim'); // [esim-patch] P49
  const cartCount = useCartCount();
  const reduceMotion = useReduceMotion();

  return (
    <Tabs
      tabBar={(props) => (
        <EsimTabBar {...props} tabs={APP_LAYOUT.tabs} badges={{ cart: cartCount }} />
      )}
      // Each tab's stack draws the headers; the tabs change with a short crossfade.
      screenOptions={{ headerShown: false, animation: tabAnimation(reduceMotion) }}>
      <Tabs.Screen name={TAB_ROUTES.home} options={{ title: t('home') }} />
      <Tabs.Screen name={TAB_ROUTES.search} options={{ title: t('search') }} />
      <Tabs.Screen name={TAB_ROUTES.categories} options={{ title: t('categories') }} />
      <Tabs.Screen name={TAB_ROUTES.cart} options={{ title: t('cart') }} />
      <Tabs.Screen name={TAB_ROUTES.account} options={{ title: t('account') }} />
      {/* [esim-patch] P49 the eSIM tabs (the bar shows APP_LAYOUT.tabs). */}
      <Tabs.Screen name={TAB_ROUTES.destinations} options={{ title: tEsim('tabDestinations') }} />
      <Tabs.Screen name={TAB_ROUTES.esims} options={{ title: tEsim('tabEsims') }} />
    </Tabs>
  );
}
