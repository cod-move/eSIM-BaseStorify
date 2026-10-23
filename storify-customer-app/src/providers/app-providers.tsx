import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { useEffect, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { persistOptions, queryClient } from '@/api/query-client';
import { tabBarSpace } from '@/components/shell/tab-bar';
import { Text } from '@/components/ui/text';
import { ToastHost } from '@/components/ui/toast';
import { env } from '@/config/env';
import { StripeReturnListener } from '@/features/payments/stripe-return-listener';
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
            <Toasts />
            <StripeReturnListener />
            {env.apiMock ? <MockBadge /> : null}
          </I18nProvider>
        </PersistQueryClientProvider>
      </KeyboardProvider>
    </SafeAreaListener>
  );
}

/** The toast floats over the tab bar: the space the bar takes, taken from the bar itself. */
function Toasts() {
  const { bottom } = useSafeAreaInsets();

  return <ToastHost bottomOffset={tabBarSpace(bottom)} />;
}

function NavigationTheme({ children }: PropsWithChildren) {
  const theme = useNavigationTheme();

  // On Android the window shows behind the translucent system navigation bar: it wears the page's colour.
  useEffect(() => {
    setBackgroundColorAsync(theme.colors.background).catch(() => undefined);
  }, [theme.colors.background]);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

/**
 * Always on screen in mock mode, so mock data is never mistaken for a store's.
 * It floats at the edge of the part of a screen that scrolls, above the tab bar
 * and any bar pinned to the bottom, so it never stays on top of a total or a
 * button. It lets touches through.
 */
function MockBadge() {
  const t = useTranslations('dev');

  return (
    <View className="pointer-events-none absolute inset-x-0 bottom-safe-offset-40 items-end pe-3">
      <View className="rounded-full bg-black/70 px-3 py-1">
        <Text variant="caption" className="text-xs text-white">
          {t('mock')}
        </Text>
      </View>
    </View>
  );
}
