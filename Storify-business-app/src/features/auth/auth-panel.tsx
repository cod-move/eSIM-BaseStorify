import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useUniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { LogoTile } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { FieldSurfaceProvider } from '@/components/ui/text-field';
import { Wash } from '@/components/ui/wash';
import { useConfig } from '@/features/config/use-config';

type AuthPanelProps = {
  /** The panel's own title, centred in its header: "Sign in". */
  title: string;
  /** A back button at the start of the header: the step before. */
  onBack?: () => void;
  children: ReactNode;
};

/**
 * The frame of signing in, drawn as the shopper app's
 * sign-in sheet: the store's mark on the account wash at the top, then a
 * `surface` panel with 28 pt top corners rising to the bottom of the screen,
 * its title centred over a line, and the form inside, where fields step down
 * to `surface-alt`. Unlike the shopper's sheet nothing is behind it to go back
 * to, so it has no close button, and it scrolls with the keyboard as a whole.
 */
export function AuthPanel({ title, onBack, children }: AuthPanelProps) {
  const t = useTranslations('common');

  return (
    <View className="flex-1 bg-background">
      <Wash name="account" />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        className="flex-1"
        contentContainerClassName="grow">
        <StoreMark />
        <View className="w-full max-w-[520px] grow self-center rounded-t-sheet bg-surface shadow-bar dark:border dark:border-border">
          <View className="min-h-16 flex-row items-center gap-2 border-b border-border px-4 py-3">
            <View className="w-11 items-start">
              {onBack ? (
                <IconButton icon="arrow-left" directional label={t('back')} onPress={onBack} />
              ) : null}
            </View>
            <Text
              variant="title"
              accessibilityRole="header"
              numberOfLines={1}
              className="flex-1 text-center">
              {title}
            </Text>
            <View className="w-11" />
          </View>
          <FieldSurfaceProvider value="surface">
            <View className="grow gap-5 px-4 pt-6 pb-safe-offset-6">{children}</View>
          </FieldSurfaceProvider>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

/**
 * Whose store this is, above the panel: its square icon (else its logo) on a
 * white tile, and its name.
 */
function StoreMark() {
  const config = useConfig();
  const { theme } = useUniwind();
  const store = config.data?.store;
  const logo = theme === 'dark' ? (store?.logoDark ?? store?.logo) : store?.logo;

  return (
    <View className="items-center gap-3 px-4 pt-safe-offset-10 pb-8">
      {store ? (
        <>
          <View className="rounded-2xl bg-surface p-1 shadow-card">
            <LogoTile logo={store.icon ?? logo} size="lg" className="border-0" />
          </View>
          <Text variant="heading" numberOfLines={1} className="text-center">
            {store.name}
          </Text>
        </>
      ) : null}
    </View>
  );
}
