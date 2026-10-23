import { act, renderHook } from '@testing-library/react-native';
import { useCSSVariable } from 'uniwind';

import { ACCENTS } from '../accents';
import { useThemeStore } from '../theme-store';
import { useWash } from '../use-wash';

// `useCSSVariable` answers for the mode the app is in; here, as the tests set it.
jest.mock('uniwind', () => ({ useCSSVariable: jest.fn(), Uniwind: { setTheme: jest.fn() } }));

const read = jest.mocked(useCSSVariable);

beforeEach(() => useThemeStore.setState({ choice: null, storeMode: 'light', accent: null }));

describe('useWash', () => {
  it('reads the three tokens of the screen’s wash, top to bottom', async () => {
    read.mockReturnValue(['#59a3ed', '#aad0f6', '#e8f1f9']);
    const { result } = await renderHook(() => useWash('account'));

    expect(read).toHaveBeenCalledWith([
      '--color-wash-account-top',
      '--color-wash-account-middle',
      '--color-wash-account-bottom',
    ]);
    expect(result.current.colors).toEqual(['#59a3ed', '#aad0f6', '#e8f1f9']);
    expect(result.current.locations).toEqual([0, 0.55, 1]);
  });

  it('reads the profile’s own wash', async () => {
    read.mockReturnValue(['#769deb', '#c6c9f2', '#f1eff9']);
    await renderHook(() => useWash('profile'));

    expect(read).toHaveBeenCalledWith([
      '--color-wash-profile-top',
      '--color-wash-profile-middle',
      '--color-wash-profile-bottom',
    ]);
  });

  it.each(['account', 'profile'] as const)(
    'paints the %s wash in the accent the shopper picked, in the mode the app is in',
    async (name) => {
      read.mockReturnValue(['#59a3ed', '#aad0f6', '#e8f1f9']);
      useThemeStore.setState({ accent: 'graphite' });
      const { result } = await renderHook(() => useWash(name));

      expect(result.current.colors).toEqual(ACCENTS.graphite.light.wash);

      await act(async () => useThemeStore.setState({ choice: 'dark' }));
      expect(result.current.colors).toEqual(ACCENTS.graphite.dark.wash);
    }
  );

  it('shows nothing, not the word "undefined", for a token it cannot find', async () => {
    read.mockReturnValue([undefined, 12, '#f4f8f8']);
    const { result } = await renderHook(() => useWash('account'));

    expect(result.current.colors).toEqual(['transparent', 'transparent', '#f4f8f8']);
  });
});
