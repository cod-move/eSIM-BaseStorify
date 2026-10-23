import { Stack } from 'expo-router';

import type { ScreenList } from './types';

/** The lists of the catalogue. Each sets its own title: what it lists. */
export const browseScreens: ScreenList = ({ t }) => [
  <Stack.Screen
    key="products/index"
    name="products/index"
    options={{ title: t('browse.title') }}
  />,
  <Stack.Screen key="brands/index" name="brands/index" />,
  <Stack.Screen key="vendors/index" name="vendors/index" />,
];
