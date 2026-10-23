import { Stack } from 'expo-router';

import type { ScreenList } from './types';

/**
 * Checkout and where it ends, open to everybody. Like the other screens they
 * are pushed in the tab they are opened from, under the tab bar (`(tabs)/(1-home,…)/checkout/`):
 * from the cart, in the Cart tab with the tab lit; from a product's Buy Now, in
 * the tab of that product, so the way back leads to it. The outcome replaces
 * checkout in the same stack. Checkout sends a guest to sign in where the store
 * sells to signed-in shoppers only, and a guest's order ends on the outcome
 * screen like anybody's.
 */
export const checkoutTabScreens: ScreenList = ({ t }) => [
  <Stack.Screen
    key="checkout/index"
    name="checkout/index"
    options={{ title: t('checkout.title') }}
  />,
  <Stack.Screen
    key="checkout/success"
    name="checkout/success"
    options={{ headerShown: false, gestureEnabled: false }}
  />,
];

/** A guest's way to their order, over the bar. Not built yet: no title, and nothing links here. */
export const checkoutScreens: ScreenList = () => [
  <Stack.Screen key="track-order" name="track-order" options={{ title: '' }} />,
];
