import { Stack } from 'expo-router';

import type { ScreenList } from './types';

/**
 * A sheet over the screen the shopper was on: no header, and no animation of
 * the navigator's own, since `SheetStage` raises, dims and closes the sheet itself.
 */
const SHEET = { presentation: 'transparentModal', animation: 'none', headerShown: false } as const;

/** The shopper's orders and notifications; the tracking sheet opens over the order. */
export const ordersScreens: ScreenList = ({ t }) => [
  <Stack.Screen
    key="account/orders/[id]/tracking"
    name="account/orders/[id]/tracking"
    options={{ ...SHEET, title: t('orders.trackTitle') }}
  />,
];
