import { Uniwind } from 'uniwind';

import { isColor } from './color';

/**
 * The colour tokens of `src/global.css`, by name: `background` is
 * `--color-background`, which the classes `bg-background`, `text-background` …
 * read. A test holds this list to the stylesheet.
 */
export const COLOR_TOKENS = [
  'background',
  'surface',
  'surface-alt',
  'foreground',
  'muted',
  'border',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'accent',
  'accent-foreground',
  'link',
  'info',
  'info-soft',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'danger',
  'danger-soft',
  'danger-foreground',
  'scrim',
  'on-scrim',
  'logo-tile',
  'wash-account-top',
  'wash-account-middle',
  'wash-account-bottom',
  'wash-profile-top',
  'wash-profile-middle',
  'wash-profile-bottom',
] as const;

/**
 * The screens that sit on a wash, and the three tokens of each, top to bottom
 * (`wash-account-top` is `--color-wash-account-top`).
 */
export const WASHES = {
  account: ['wash-account-top', 'wash-account-middle', 'wash-account-bottom'],
  profile: ['wash-profile-top', 'wash-profile-middle', 'wash-profile-bottom'],
} as const;

export type WashName = keyof typeof WASHES;

type ColorToken = (typeof COLOR_TOKENS)[number];

/** Colours for some tokens of one theme. A token left out keeps the app's colour. */
type TokenColors = Partial<Record<ColorToken, string>>;

/** Colours for the light and the dark theme, as a store's theme describes them. */
export type ThemeColors = { light?: TokenColors; dark?: TokenColors };

const TOKEN_NAMES = new Set<string>(COLOR_TOKENS);

/**
 * Replaces the app's colours with the store's, for every screen at once.
 * Today the store sends its two brand colours (`GET /config`); any token can
 * be replaced the same way.
 *
 * A value the app cannot read is skipped, so the token keeps the app's own
 * colour instead of losing its colour altogether. The store's colours are
 * applied as sent: warning a merchant about poor contrast is the admin's job.
 */
export function applyThemeColors(colors: ThemeColors): void {
  for (const theme of ['light', 'dark'] as const) {
    const variables: Record<string, string> = {};
    for (const [token, value] of Object.entries(colors[theme] ?? {})) {
      if (TOKEN_NAMES.has(token) && isColor(value)) variables[`--color-${token}`] = value.trim();
    }
    if (Object.keys(variables).length > 0) Uniwind.updateCSSVariables(theme, variables);
  }
}
