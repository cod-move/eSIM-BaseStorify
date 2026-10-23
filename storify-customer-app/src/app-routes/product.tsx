import { Stack } from 'expo-router';

import type { ScreenList } from './types';

/**
 * The product page, pushed in the tab it is opened from. Its title stays empty
 * until the product has arrived; the page then puts its seller there, beside
 * the way back. The header has no line from the first frame, so nothing moves
 * when the product arrives.
 */
const PRODUCT = { title: '', headerShadowVisible: false } as const;

export const productScreens: ScreenList = () => [
  <Stack.Screen key="products/[slug]" name="products/[slug]" options={PRODUCT} />,
];

/**
 * A sheet over the screen the shopper was on, covering the tab bar: no header,
 * and no animation of the navigator's own, since `SheetStage` raises, dims and
 * closes the sheet itself.
 */
const SHEET = { presentation: 'transparentModal', animation: 'none', headerShown: false } as const;

/** The product page's description, specification and reviews: sheets on the root stack. */
export const productSheets: ScreenList = ({ t }) => [
  <Stack.Screen
    key="products/[slug]/description"
    name="products/[slug]/description"
    options={{ ...SHEET, title: t('reviews.descriptionTitle') }}
  />,
  <Stack.Screen
    key="products/[slug]/specification"
    name="products/[slug]/specification"
    options={{ ...SHEET, title: t('reviews.specificationTitle') }}
  />,
  <Stack.Screen
    key="products/[slug]/reviews"
    name="products/[slug]/reviews"
    options={{ ...SHEET, title: t('reviews.title') }}
  />,
  // Not built yet: nothing links here.
  <Stack.Screen
    key="products/[slug]/write-review"
    name="products/[slug]/write-review"
    options={SHEET}
  />,
];
