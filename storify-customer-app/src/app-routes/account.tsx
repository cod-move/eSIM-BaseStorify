import { Stack } from 'expo-router';

import { HeaderTitle } from '@/components/shell/app-header';

import type { ScreenList } from './types';

/**
 * A sheet over the screen the shopper was on: no header, and no animation of
 * the navigator's own, since `SheetStage` raises, dims and closes the sheet itself.
 */
const SHEET = { presentation: 'transparentModal', animation: 'none', headerShown: false } as const;

/** A screen whose title it gives itself once it is built. */
const UNTITLED = { title: '' } as const;

/**
 * The signed-in shopper's own screens, under `/account`, and the app's
 * settings. They are pushed in the tab they are opened from, under the bar.
 */
export const accountScreens: ScreenList = ({ t, isSignedIn }) => [
  <Stack.Screen
    key="settings"
    name="account/settings/index"
    options={{ headerTitle: () => <HeaderTitle icon="appearance" title={t('settings.title')} /> }}
  />,
  // Signed-in shoppers only. A guest who lands here is sent back to the tab's first screen.
  <Stack.Protected key="signed-in" guard={isSignedIn}>
    <Stack.Screen name="account/profile/index" options={{ title: '', headerTransparent: true }} />
    <Stack.Screen name="account/tracking" options={UNTITLED} />
    <Stack.Screen
      name="account/security/index"
      options={{ headerTitle: () => <HeaderTitle icon="lock" title={t('security.title')} /> }}
    />
    {/* Not built yet: no title, and nothing links here. */}
    <Stack.Screen name="account/reviews/index" options={UNTITLED} />
    <Stack.Screen name="account/returns/index" options={UNTITLED} />
    <Stack.Screen name="account/preferences/index" options={UNTITLED} />
    <Stack.Screen name="account/inbox/index" options={UNTITLED} />
    <Stack.Screen name="account/inbox/[id]" options={UNTITLED} />
  </Stack.Protected>,
];

/** The account's sheets. They cover the bar, so they open over the tabs, on the root stack. */
export const accountSheets: ScreenList = ({ t, isSignedIn }) => [
  // Signed-in shoppers only. A guest who lands here is sent back to the tabs.
  <Stack.Protected key="signed-in" guard={isSignedIn}>
    <Stack.Screen
      name="account/security/password"
      options={{ ...SHEET, title: t('security.changePassword') }}
    />
    <Stack.Screen
      name="account/security/delete"
      options={{ ...SHEET, title: t('security.deleteAccount') }}
    />
    <Stack.Screen name="account/security/two-factor" options={SHEET} />
  </Stack.Protected>,
];
