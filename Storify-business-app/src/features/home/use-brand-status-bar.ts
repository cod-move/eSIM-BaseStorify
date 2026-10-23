import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { useCSSVariable } from 'uniwind';

import { parseColor } from '@/theme/color';
import { useThemeMode } from '@/theme/use-theme';

/** Whether a colour is light enough that the status bar should be dark over it (relative luminance). */
function isLight(color: string): boolean {
  const parsed = parseColor(color);
  if (!parsed) return false;
  const [r, g, b] = [parsed.r, parsed.g, parsed.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/**
 * While a screen whose top is the store's `primary` is in front (Home), the
 * status bar takes the colour's foreground: light over a dark brand, dark over
 * a light one. Leaving it gives the bar back to the theme, as the app's
 * providers set it.
 */
export function useBrandStatusBar(): void {
  const foreground = String(useCSSVariable('--color-primary-foreground') ?? '');
  const mode = useThemeMode();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(isLight(foreground) || !foreground ? 'light' : 'dark');
      return () => setStatusBarStyle(mode === 'dark' ? 'light' : 'dark');
    }, [foreground, mode])
  );
}
