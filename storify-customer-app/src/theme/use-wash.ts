import { useCSSVariable } from 'uniwind';

import { ACCENTS } from './accents';
import { useThemeStore } from './theme-store';
import { WASHES, type WashName } from './tokens';
import { useThemeMode } from './use-theme';

/** Where the three colours of a wash sit on a screen, top (0) to bottom (1). */
const WASH_LOCATIONS = [0, 0.55, 1] as const;

type Wash = {
  colors: readonly [string, string, string];
  locations: typeof WASH_LOCATIONS;
};

/**
 * The gradient behind the account or the profile screen, in the colours of the
 * mode the app is in. A gradient takes colours as values, not as class names,
 * so this reads the tokens (`--color-wash-account-top` …) and hands them over
 * ready for a `LinearGradient`'s `colors` and `locations`. The shopper's accent
 * colour (Profile), when they picked one, replaces the tokens on both screens.
 */
export function useWash(name: WashName): Wash {
  const [top, middle, bottom] = useCSSVariable(WASHES[name].map((token) => `--color-${token}`));
  const accent = useThemeStore((state) => state.accent);
  const mode = useThemeMode();

  if (accent) return { colors: ACCENTS[accent][mode].wash, locations: WASH_LOCATIONS };
  return {
    colors: [paint(top), paint(middle), paint(bottom)],
    locations: WASH_LOCATIONS,
  };
}

// A token the stylesheet lacks reads as nothing: the screen shows its own
// background rather than the word "undefined" as a colour.
function paint(value: string | number | undefined): string {
  return typeof value === 'string' ? value : 'transparent';
}
