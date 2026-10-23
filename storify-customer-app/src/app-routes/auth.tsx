import { Stack } from 'expo-router';

import type { ScreenList } from './types';

/**
 * Signing in. Each screen is a sheet over the screen the shopper was on, so it
 * has no header, and no animation of the navigator's own: `SheetStage` raises,
 * dims and closes the sheet itself.
 */
const SHEET = { presentation: 'transparentModal', animation: 'none', headerShown: false } as const;

export const authScreens: ScreenList = ({ t, isSignedIn }) => [
  // Guests only: signing in closes these screens by itself.
  <Stack.Protected key="guests" guard={!isSignedIn}>
    <Stack.Screen name="(auth)/login" options={{ ...SHEET, title: t('auth.signIn') }} />
    <Stack.Screen name="(auth)/register" options={{ ...SHEET, title: t('auth.signUpTitle') }} />
    <Stack.Screen
      name="(auth)/forgot-password"
      options={{ ...SHEET, title: t('auth.forgotTitle') }}
    />
  </Stack.Protected>,
];
