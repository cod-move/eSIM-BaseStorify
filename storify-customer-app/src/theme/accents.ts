/**
 * The accent colours a shopper can pick, on this device, for the gradient behind
 * the Account and Profile screens. This is the one place their values are
 * written: a screen reads them through `ACCENTS`, never as literals. Buttons and
 * the rest of the app keep the store's colours.
 *
 * Each accent has the colour its swatch shows in the picker (and the colour of
 * the check drawn on it), and the three colours of its wash, top to bottom, for
 * the light and the dark theme. The washes are as deep as the app's own
 * ("Ocean", the `wash-*` tokens): a saturated top easing to a near-page tint in
 * light mode, a quiet tinted charcoal in dark mode. Text sits straight on a
 * wash in `foreground`, so every stop keeps 4.5:1 with it (a test holds this).
 * The "store default" is not here: it is the absence of a choice, and the
 * app's own wash tokens apply.
 */
type AccentMode = {
  swatch: string;
  check: string;
  wash: readonly [string, string, string];
};

export const ACCENTS = {
  blue: {
    light: { swatch: '#1d4ed8', check: '#ffffff', wash: ['#7e9af5', '#bccbfa', '#eceffc'] },
    dark: { swatch: '#60a5fa', check: '#111111', wash: ['#222e5a', '#272d46', '#2e303a'] },
  },
  violet: {
    light: { swatch: '#6d28d9', check: '#ffffff', wash: ['#a88df2', '#d2c5f9', '#f2eefb'] },
    dark: { swatch: '#a78bfa', check: '#111111', wash: ['#362858', '#332a45', '#322e39'] },
  },
  purple: {
    light: { swatch: '#7e22ce', check: '#ffffff', wash: ['#c484e9', '#e1c0f4', '#f6edfa'] },
    dark: { swatch: '#c084fc', check: '#111111', wash: ['#40264d', '#392940', '#352e39'] },
  },
  pink: {
    light: { swatch: '#be185d', check: '#ffffff', wash: ['#eb76b1', '#f5bbd8', '#faedf3'] },
    dark: { swatch: '#f472b6', check: '#111111', wash: ['#4a2436', '#3e2832', '#382d32'] },
  },
  red: {
    light: { swatch: '#b91c1c', check: '#ffffff', wash: ['#ec7c80', '#f6bdbf', '#faeded'] },
    dark: { swatch: '#f87171', check: '#111111', wash: ['#4e2424', '#3f2929', '#392e2e'] },
  },
  orange: {
    light: { swatch: '#c2410c', check: '#ffffff', wash: ['#ef8035', '#f7c09c', '#faeee5'] },
    dark: { swatch: '#fb923c', check: '#111111', wash: ['#422c1c', '#392c23', '#352f2c'] },
  },
  amber: {
    light: { swatch: '#b45309', check: '#ffffff', wash: ['#d3900b', '#f6c35d', '#f9eed8'] },
    dark: { swatch: '#fbbf24', check: '#111111', wash: ['#3b2e18', '#362d1f', '#34302a'] },
  },
  lime: {
    light: { swatch: '#4d7c0f', check: '#ffffff', wash: ['#79ad2b', '#acd969', '#eaf3dc'] },
    dark: { swatch: '#a3e635', check: '#111111', wash: ['#29341a', '#2a3220', '#2e3229'] },
  },
  green: {
    light: { swatch: '#15803d', check: '#ffffff', wash: ['#3cb367', '#94dbae', '#e4f4e9'] },
    dark: { swatch: '#4ade80', check: '#111111', wash: ['#1c3526', '#223228', '#29332d'] },
  },
  teal: {
    light: { swatch: '#0f766e', check: '#ffffff', wash: ['#33afa2', '#81dbd2', '#e1f3f2'] },
    dark: { swatch: '#2dd4bf', check: '#111111', wash: ['#193533', '#203230', '#293332'] },
  },
  sand: {
    light: { swatch: '#7c6a55', check: '#ffffff', wash: ['#b79972', '#d9c9b5', '#f4f0ea'] },
    dark: { swatch: '#d6c3a5', check: '#111111', wash: ['#382f23', '#332e26', '#33302c'] },
  },
  graphite: {
    light: { swatch: '#475569', check: '#ffffff', wash: ['#959fac', '#c7cbd3', '#eef0f2'] },
    dark: { swatch: '#94a3b8', check: '#111111', wash: ['#2c3138', '#2c2f33', '#2f3033'] },
  },
} as const satisfies Record<string, { light: AccentMode; dark: AccentMode }>;

export type AccentId = keyof typeof ACCENTS;

/** The accents in the order the picker shows them: round the colour wheel, then the two quiet ones. */
export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export function isAccentId(value: unknown): value is AccentId {
  return ACCENT_IDS.some((id) => id === value);
}
