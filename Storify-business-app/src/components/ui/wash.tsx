import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { useRtl } from '@/i18n/use-rtl';
import { transparentOf, withOpacity } from '@/theme/color';
import { WASHES, type WashName } from '@/theme/tokens';

/** Where the three colours of a wash sit on a screen, top (0) to bottom (1). */
const LOCATIONS = [0, 0.55, 1] as const;

/**
 * The brand wash's stops: the store's `primary`, solid under the screen's
 * header, fading out to the page's background a little past the middle.
 */
const BRAND_LOCATIONS = [0, 0.2, 0.38, 0.62] as const;

/** What a screen can sit on: a wash of the theme's tokens, or the store's own colour. */
export type ScreenWash = WashName | 'brand';

// A token the stylesheet lacks reads as nothing: the screen shows its own
// background rather than the word "undefined" as a colour.
function paint(value: string | number | undefined): string {
  return typeof value === 'string' ? value : 'transparent';
}

/**
 * A gradient behind a whole screen, in the mode's colours; it sits behind
 * the screen's content and takes no touches. `account` and `profile` are the
 * shopper app's soft washes, read from the `wash-*`
 * tokens; `brand` is Home's colour (the Account tab), fading down the screen.
 */
export function Wash({ name }: { name: ScreenWash }) {
  return name === 'brand' ? <BrandWash /> : <TokenWash name={name} />;
}

function TokenWash({ name }: { name: WashName }) {
  const [top, middle, bottom] = useCSSVariable(WASHES[name].map((token) => `--color-${token}`));
  return (
    <LinearGradient
      colors={[paint(top), paint(middle), paint(bottom)]}
      locations={LOCATIONS}
      style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
    />
  );
}

/**
 * The store's `primary` from under the status bar, as Home's header is, with
 * the same sheen of its foreground from the top end corner; it fades into the
 * page's background further down, so the cards below sit on the page. What
 * is drawn on its top is drawn in `primary-foreground`.
 */
function BrandWash() {
  const [primary, foreground] = useCSSVariable(['--color-primary', '--color-primary-foreground']);
  const brand = paint(primary);
  const light = paint(foreground);
  const rtl = useRtl();
  return (
    <>
      <LinearGradient
        colors={[brand, brand, withOpacity(brand, 0.55), transparentOf(brand)]}
        locations={BRAND_LOCATIONS}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />
      <LinearGradient
        colors={[withOpacity(light, 0.18), withOpacity(light, 0.04), transparentOf(light)]}
        locations={[0, 0.45, 0.9]}
        start={{ x: rtl ? 0 : 1, y: 0 }}
        end={{ x: rtl ? 1 : 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { bottom: '62%', pointerEvents: 'none' }]}
      />
    </>
  );
}
