import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { persistOptions, queryClient } from '@/api/query-client';
import { Text } from '@/components/ui/text';
import { env } from '@/config/env';
import { I18nProvider } from '@/i18n/provider';
import { useNavigationTheme } from '@/theme/use-theme';

/**
 * Everything the screens stand on, in the order they depend on each other:
 * server data (with the part that is kept across restarts), the app's language,
 * then the navigator's colours.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    // Feeds the device's safe-area insets to the `*-safe` classes (`pt-safe`, `pb-safe`).
    <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
      <KeyboardProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <I18nProvider>
            <NavigationTheme>{children}</NavigationTheme>
            {env.apiMock ? <MockBadge /> : null}
          </I18nProvider>
        </PersistQueryClientProvider>
      </KeyboardProvider>
    </SafeAreaListener>
  );
}

function NavigationTheme({ children }: PropsWithChildren) {
  const theme = useNavigationTheme();

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

/**
 * Always on screen in mock mode, so mock data is never mistaken for a store's.
 * It lets touches through, and sits small in the strip under the tab bar, clear
 * of the bar, its toasts and a screen's action bar.
 */
function MockBadge() {
  const t = useTranslations('dev');

  return (
    <View className="pointer-events-none absolute start-3 bottom-0.5">
      <View className="rounded-full bg-scrim/70 px-2 py-px">
        <Text variant="caption" className="text-[10px] leading-[14px] text-on-scrim">
          {t('mock')}
        </Text>
      </View>
    </View>
  );
}
