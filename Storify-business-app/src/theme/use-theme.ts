import { DefaultTheme, type Theme } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Uniwind, useCSSVariable } from 'uniwind';

import type { Config } from '@/contracts/mobile/biz/v1';

import { useThemeStore, type ThemeChoice, type ThemeMode } from './theme-store';
import { applyThemeColors } from './tokens';

// Until the store has said which theme it opens in, and for an operator who has
// not chosen one, the app is light: decided before the first frame, so a phone
// set to dark never flashes a dark screen first. An operator who chose "System"
// gets the phone's mode at once.
Uniwind.setTheme(useThemeStore.getState().choice ?? 'light');

/**
 * Keeps the theme in step with the store and the operator.
 *
 * The mode is the operator's choice, else the store's setting. "System" hands
 * the choice to Uniwind, which then follows the phone's light or dark setting
 * as it changes. The store's colours replace the app's tokens at run time,
 * which is what makes one build of the app wear any store's colours: today the
 * two brand colours, later the store's whole theme (`applyThemeColors`).
 */
export function useThemeSync(config: Config | undefined): void {
  const choice = useThemeStore((state) => state.choice);
  const storeMode = config?.theme.mode ?? 'light';
  const theme: ThemeChoice = choice ?? storeMode;
  const brand = config?.theme.brand;

  useEffect(() => {
    useThemeStore.getState().setStoreMode(storeMode);
  }, [storeMode]);

  useEffect(() => {
    Uniwind.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!brand) return;
    applyThemeColors({
      light: { primary: brand.light.primary, 'primary-foreground': brand.light.primaryForeground },
      dark: { primary: brand.dark.primary, 'primary-foreground': brand.dark.primaryForeground },
    });
  }, [brand]);
}

/**
 * The mode the app is drawn in now: the operator's choice, else the store's; in
 * "System", the phone's. For the few things that take a mode rather than a
 * token, such as a blur's tint or the navigator's status bar.
 */
export function useThemeMode(): ThemeMode {
  const choice = useThemeStore((state) => state.choice);
  const storeMode = useThemeStore((state) => state.storeMode);
  const phone = useColorScheme();
  const theme = choice ?? storeMode;

  if (theme !== 'system') return theme;
  return phone === 'dark' ? 'dark' : 'light';
}

/**
 * The design tokens as the navigator needs them: headers, the tab bar and the
 * space behind screens are drawn by the navigator, which takes colours as
 * values and not as class names.
 */
export function useNavigationTheme(): Theme {
  const mode = useThemeMode();
  const [background, foreground, border, primary] = useCSSVariable([
    '--color-background',
    '--color-foreground',
    '--color-border',
    '--color-primary',
  ]);

  return {
    dark: mode === 'dark',
    colors: {
      primary: String(primary),
      background: String(background),
      card: String(background),
      text: String(foreground),
      border: String(border),
      notification: String(primary),
    },
    fonts: DefaultTheme.fonts,
  };
}
