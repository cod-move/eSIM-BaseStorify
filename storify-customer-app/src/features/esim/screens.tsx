import { Stack } from 'expo-router';

import { HeaderTitle } from '@/components/shell/app-header';

import type { ScreenList } from '@/app-routes/types';

/**
 * The eSIM module's account screens (patch P23), for the signed-in part of
 * `accountScreens` (src/app-routes/account.tsx).
 */
export const esimAccountScreens: ScreenList = ({ t }) => [
  <Stack.Screen
    key="esims"
    name="account/esims/index"
    options={{ headerTitle: () => <HeaderTitle icon="globe" title={t('esim.title')} /> }}
  />,
  <Stack.Screen key="esim" name="account/esims/[id]/index" options={{ title: '' }} />,
  <Stack.Screen key="esim-topup" name="account/esims/[id]/topup" options={{ title: '' }} />,
  <Stack.Screen key="esim-balance" name="account/esims/balance" options={{ title: '' }} />,
  <Stack.Screen key="esim-referrals" name="account/esims/referrals" options={{ title: '' }} />,
];
