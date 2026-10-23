import type { ReactElement } from 'react';
import type { useTranslations } from 'use-intl';

/** What a layout hands every area. It is the same for all, so it calls them all alike. */
type ScreenListProps = {
  /** The root translator: a title names its key in full (`catalog.products`). */
  t: ReturnType<typeof useTranslations<never>>;
  /** Whether a shopper is signed in, for the screens behind `Stack.Protected`. */
  isSignedIn: boolean;
};

/**
 * An area's entries in a `Stack`: those of its screens that need options, and
 * its `Stack.Protected` groups. Most areas' screens are pushed in each tab's
 * stack (`src/app/(tabs)/(1-home,…)/_layout.tsx`); the screens that hide the
 * tab bar, sign-in and the sheets, are on the root stack
 * (`src/app/_layout.tsx`).
 *
 * A list whose entries each have a `key`, never a fragment. The `Stack` reads
 * the screens of a list, but takes a fragment for an unknown child and fails to
 * render (Expo Router 57).
 */
export type ScreenList = (props: ScreenListProps) => ReactElement[];
