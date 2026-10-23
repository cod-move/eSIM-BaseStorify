import { STORAGE_KEYS } from '@/lib/storage-keys';
import { storage } from '@/lib/storage';

import { ACCENT_IDS, ACCENTS, isAccentId } from '../accents';
import { parseColor } from '../color';
import { useThemeStore } from '../theme-store';
import { WASHES } from '../tokens';

// The tests run from the project's root. Node's own types are not part of the app's.
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const stylesheet = readFileSync(`${process.cwd()}/src/global.css`, 'utf8');

/** A theme block's value for one token of global.css. */
function token(theme: 'light' | 'dark', name: string): string {
  const start = stylesheet.indexOf(`@variant ${theme} {`);
  const end = stylesheet.indexOf('}', start);
  const value = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(stylesheet.slice(start, end))?.[1];
  if (!value) throw new Error(`no --color-${name} in the ${theme} theme`);
  return value.trim();
}

/** WCAG relative luminance and contrast ratio. */
function luminance(value: string): number {
  const color = parseColor(value);
  if (!color) throw new Error(`not a colour: ${value}`);
  const [r = 0, g = 0, b = 0] = [color.r, color.g, color.b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

beforeEach(() => {
  storage.remove(STORAGE_KEYS.accent);
  useThemeStore.setState({ accent: null });
});

describe('the accent palette', () => {
  it('offers twelve colours, round the colour wheel and then the quiet ones', () => {
    expect(ACCENT_IDS).toEqual([
      'blue',
      'violet',
      'purple',
      'pink',
      'red',
      'orange',
      'amber',
      'lime',
      'green',
      'teal',
      'sand',
      'graphite',
    ]);
  });

  it.each(ACCENT_IDS.flatMap((id) => (['light', 'dark'] as const).map((mode) => [id, mode])))(
    '%s in %s has a clear check on its swatch and a wash of three colours',
    (id, mode) => {
      const accent = ACCENTS[id as keyof typeof ACCENTS][mode as 'light' | 'dark'];

      expect(parseColor(accent.swatch)).not.toBeNull();
      expect(contrast(accent.swatch, accent.check)).toBeGreaterThanOrEqual(4.5);
      expect(accent.wash).toHaveLength(3);
      for (const colour of accent.wash) expect(parseColor(colour)).not.toBeNull();
    }
  );

  it('knows its own names only', () => {
    expect(isAccentId('red')).toBe(true);
    expect(isAccentId('graphite')).toBe(true);
    expect(isAccentId('toString')).toBe(false);
    expect(isAccentId(null)).toBe(false);
  });
});

// "Welcome!", the shopper's name, the bell and "Purchases" sit straight on the
// wash in `foreground`, and the content scrolls over every part of it.
describe('text on a wash', () => {
  const modes = ['light', 'dark'] as const;

  it.each(modes)(
    'keeps 4.5:1 with foreground on every stop of the app’s own wash, in %s',
    (mode) => {
      const foreground = token(mode, 'foreground');
      const faint = [...WASHES.account, ...WASHES.profile].filter(
        (name) => contrast(token(mode, name), foreground) < 4.5
      );
      expect(faint).toEqual([]);
    }
  );

  it.each(ACCENT_IDS.flatMap((id) => modes.map((mode) => [id, mode] as const)))(
    'keeps 4.5:1 with foreground on every stop of the %s wash, in %s',
    (id, mode) => {
      const foreground = token(mode, 'foreground');
      for (const colour of ACCENTS[id][mode].wash) {
        expect(contrast(colour, foreground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it('is deepest at the top in light mode, easing towards the page', () => {
    const lightness = (wash: readonly string[]) => wash.map(luminance);
    const washes = [
      lightness(WASHES.account.map((name) => token('light', name))),
      lightness(WASHES.profile.map((name) => token('light', name))),
      ...ACCENT_IDS.map((id) => lightness(ACCENTS[id].light.wash)),
    ];
    for (const wash of washes) expect([...wash].sort((a, b) => a - b)).toEqual(wash);
  });
});

describe('the shopper’s accent choice', () => {
  it('is the store’s colour until one is picked', () => {
    expect(useThemeStore.getState().accent).toBeNull();
  });

  it('is kept on the device, and removed when cleared', () => {
    useThemeStore.getState().chooseAccent('pink');
    expect(storage.get(STORAGE_KEYS.accent)).toBe('pink');
    expect(useThemeStore.getState().accent).toBe('pink');

    useThemeStore.getState().chooseAccent(null);
    expect(storage.get(STORAGE_KEYS.accent)).toBeNull();
    expect(useThemeStore.getState().accent).toBeNull();
  });

  it('is read back when the app opens again', () => {
    storage.set(STORAGE_KEYS.accent, 'orange');

    jest.isolateModules(() => {
      const { useThemeStore: reopened } =
        jest.requireActual<typeof import('../theme-store')>('../theme-store');
      expect(reopened.getState().accent).toBe('orange');
    });
  });

  it('ignores a saved value that is not on the list', () => {
    storage.set(STORAGE_KEYS.accent, 'chartreuse');

    jest.isolateModules(() => {
      const { useThemeStore: reopened } =
        jest.requireActual<typeof import('../theme-store')>('../theme-store');
      expect(reopened.getState().accent).toBeNull();
    });
  });
});
