// First, before anything that formats a message: see the file for why.
import '@/i18n/polyfills';
import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslations } from 'use-intl';

import { accountSheets } from '@/app-routes/account';
import { authScreens } from '@/app-routes/auth';
import { checkoutScreens } from '@/app-routes/checkout';
import { productSheets } from '@/app-routes/product';
import { StackHeader } from '@/components/shell/app-header';
import { LaunchCover } from '@/components/shell/launch-cover';
import { ShellServices } from '@/components/shell/services';
import { STACK_ANIMATION, screenEntrance } from '@/components/ui/motion';
import { useSession } from '@/features/auth/use-session';
import { useSessionSync } from '@/features/auth/use-session-sync';
import { AppGate } from '@/features/config/app-gate';
import { applyDirection } from '@/i18n/direction';
import { useLocaleStore } from '@/i18n/locale-store';
import { AppProviders } from '@/providers/app-providers';

// The splash screen stays until `AppGate` has something to show.
void SplashScreen.preventAutoHideAsync();

// The layout's direction follows the app's language. When the two disagree the
// app restarts itself, once, and there is nothing to draw in the meantime.
const restarting = applyDirection(useLocaleStore.getState().locale);

/**
 * The screen under one that a link opens on the root stack: a cold start on
 * `/login` or a sheet shows the tabs, with Home, behind it, and closing it
 * leads there.
 */
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  if (restarting) return null;

  return (
    <AppProviders>
      <AppGate>
        <Screens />
        <ShellServices />
      </AppGate>
      {/* Over everything until the first screen has laid itself out. */}
      <LaunchCover />
    </AppProviders>
  );
}

/**
 * The route map. A screen is a file in this folder. Each area lists, in
 * `src/app-routes/<area>.tsx`, those of its screens that need a title, a
 * session, or the lack of one.
 *
 * The tab bar shows on every screen it can: the screens a shopper browses are
 * pushed in the tab they are opened from (`(tabs)/(1-home,…)/_layout.tsx`).
 * This stack holds the tabs and the screens that cover the bar: sign-in,
 * the sheets, the developer's gallery and "not found". Checkout, with its
 * outcome, is pushed in a tab like the browsing screens.
 *
 * The paths are those of the store's website (`/products/red-shoe`, `/cart`),
 * so a link to the site opens the same place in the app.
 */
function Screens() {
  const t = useTranslations();
  const { isSignedIn } = useSession();
  useSessionSync();

  return (
    <Stack
      screenOptions={{ ...STACK_ANIMATION, header: (props) => <StackHeader {...props} /> }}
      // The tabs do not enter: the screens of their own stacks do.
      screenLayout={(args) =>
        args.route.name === '(tabs)' ? args.children : screenEntrance(args)
      }>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {accountSheets({ t, isSignedIn })}
      {authScreens({ t, isSignedIn })}
      {checkoutScreens({ t, isSignedIn })}
      {productSheets({ t, isSignedIn })}
    </Stack>
  );
}
