import { act, renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import { Uniwind } from 'uniwind';

import { config } from '@/api/mocks/fixtures/config';
import type { Config } from '@/contracts/mobile/shop/v1';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { storage } from '@/lib/storage';

import { ACCENTS } from '../accents';
import { useThemeStore } from '../theme-store';
import { useThemeMode, useThemeSync } from '../use-theme';
import { useWash } from '../use-wash';

// The phone's own light or dark setting, which the tests turn by hand.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const setTheme = jest.mocked(Uniwind.setTheme);
const updateCSSVariables = jest.mocked(Uniwind.updateCSSVariables);
const phone = jest.mocked(useColorScheme);

/** The store's settings, with its brand and default mode as given. */
function store(theme: Partial<Config['theme']> = {}): Config {
  const base = config('en');
  return { ...base, theme: { ...base.theme, ...theme } };
}

function lastTheme() {
  return setTheme.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  storage.remove(STORAGE_KEYS.theme);
  storage.remove(STORAGE_KEYS.accent);
  useThemeStore.setState({ choice: null, storeMode: 'light', accent: null });
  phone.mockReturnValue('light');
});

describe('the store’s brand colour', () => {
  it('replaces primary and its foreground in both modes', async () => {
    await renderHook(() =>
      useThemeSync(
        store({
          brand: {
            light: { primary: '#366fff', primaryForeground: '#ffffff' },
            dark: { primary: '#7a9bff', primaryForeground: '#1a1a1a' },
          },
        })
      )
    );

    expect(updateCSSVariables).toHaveBeenCalledWith('light', {
      '--color-primary': '#366fff',
      '--color-primary-foreground': '#ffffff',
    });
    expect(updateCSSVariables).toHaveBeenCalledWith('dark', {
      '--color-primary': '#7a9bff',
      '--color-primary-foreground': '#1a1a1a',
    });
  });

  it('leaves the design’s own primary when the store has sent none', async () => {
    await renderHook(() => useThemeSync(undefined));

    expect(updateCSSVariables).not.toHaveBeenCalled();
  });

  it('keeps the design’s colour for a value it cannot read, and uses the rest', async () => {
    await renderHook(() =>
      useThemeSync(
        store({
          brand: {
            light: { primary: 'not-a-colour', primaryForeground: '#fff' },
            dark: { primary: '', primaryForeground: '' },
          },
        })
      )
    );

    expect(updateCSSVariables).toHaveBeenCalledTimes(1);
    expect(updateCSSVariables).toHaveBeenCalledWith('light', {
      '--color-primary-foreground': '#fff',
    });
  });

  it('changes when the store’s colour does', async () => {
    const brand = (primary: string): Config['theme']['brand'] => ({
      light: { primary, primaryForeground: '#ffffff' },
      dark: { primary, primaryForeground: '#ffffff' },
    });
    const { rerender } = await renderHook(
      (props: { primary: string }) => useThemeSync(store({ brand: brand(props.primary) })),
      {
        initialProps: { primary: '#366fff' },
      }
    );

    await rerender({ primary: '#ff5500' });

    expect(updateCSSVariables).toHaveBeenLastCalledWith('dark', {
      '--color-primary': '#ff5500',
      '--color-primary-foreground': '#ffffff',
    });
  });
});

describe('the shopper’s accent colour', () => {
  const brand: Config['theme']['brand'] = {
    light: { primary: '#366fff', primaryForeground: '#ffffff' },
    dark: { primary: '#7a9bff', primaryForeground: '#1a1a1a' },
  };

  it('leaves the store’s brand on buttons', async () => {
    useThemeStore.getState().chooseAccent('green');
    await renderHook(() => useThemeSync(store({ brand })));

    expect(updateCSSVariables).toHaveBeenLastCalledWith('dark', {
      '--color-primary': '#7a9bff',
      '--color-primary-foreground': '#1a1a1a',
    });
    expect(updateCSSVariables).not.toHaveBeenCalledWith(
      'light',
      expect.objectContaining({ '--color-primary': ACCENTS.green.light.swatch })
    );
  });

  it('colours the account wash in the mode’s accent, and the app’s own wash returns when cleared', async () => {
    const { result } = await renderHook(() => useWash('account'));
    const own = result.current.colors;
    expect(own).not.toEqual(ACCENTS.teal.light.wash);

    await act(async () => useThemeStore.getState().chooseAccent('teal'));
    expect(result.current.colors).toEqual(ACCENTS.teal.light.wash);

    phone.mockReturnValue('dark');
    await act(async () => useThemeStore.getState().choose('system'));
    expect(result.current.colors).toEqual(ACCENTS.teal.dark.wash);

    await act(async () => useThemeStore.getState().chooseAccent(null));
    expect(result.current.colors).toEqual(own);
  });
});

describe('the mode', () => {
  it('is the store’s until the shopper chooses', async () => {
    await renderHook(() => useThemeSync(store({ mode: 'dark' })));

    expect(lastTheme()).toBe('dark');
    expect(useThemeStore.getState().storeMode).toBe('dark');
  });

  it('is light before the store has answered', async () => {
    await renderHook(() => useThemeSync(undefined));

    expect(lastTheme()).toBe('light');
  });

  it('is the shopper’s choice over the store’s', async () => {
    useThemeStore.getState().choose('light');
    await renderHook(() => useThemeSync(store({ mode: 'dark' })));

    expect(lastTheme()).toBe('light');
  });

  it('follows the phone when the shopper chose System', async () => {
    useThemeStore.getState().choose('system');
    await renderHook(() => useThemeSync(store({ mode: 'light' })));

    expect(lastTheme()).toBe('system');
  });

  it('moves when the shopper chooses', async () => {
    await renderHook(() => useThemeSync(store({ mode: 'light' })));

    await act(async () => useThemeStore.getState().choose('dark'));
    expect(lastTheme()).toBe('dark');

    await act(async () => useThemeStore.getState().choose('system'));
    expect(lastTheme()).toBe('system');
  });

  it('is remembered on the device, System included', () => {
    useThemeStore.getState().choose('system');

    expect(storage.get(STORAGE_KEYS.theme)).toBe('system');
  });
});

describe('the mode the app is drawn in', () => {
  it('is the phone’s in System, light or dark', async () => {
    useThemeStore.getState().choose('system');

    phone.mockReturnValue('dark');
    const { result, rerender } = await renderHook(() => useThemeMode());
    expect(result.current).toBe('dark');

    phone.mockReturnValue('light');
    await rerender({});
    expect(result.current).toBe('light');
  });

  it('is the shopper’s choice whatever the phone says', async () => {
    phone.mockReturnValue('dark');
    useThemeStore.getState().choose('light');
    const { result } = await renderHook(() => useThemeMode());

    expect(result.current).toBe('light');
  });

  it('is the store’s while the shopper has not chosen', async () => {
    phone.mockReturnValue('dark');
    useThemeStore.getState().setStoreMode('dark');
    const first = await renderHook(() => useThemeMode());
    expect(first.result.current).toBe('dark');

    useThemeStore.getState().setStoreMode('light');
    const second = await renderHook(() => useThemeMode());
    expect(second.result.current).toBe('light');
  });
});
