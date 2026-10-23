import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { NavRow, RadioRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { useConfig } from '@/features/config/use-config';
import { useLocale, useLocaleStore } from '@/i18n/locale-store';
import { useThemeStore, type ThemeChoice } from '@/theme/theme-store';

import { AccentSection } from './accent-picker';
import { AppVersion } from './app-version';
import { PushStatusRow } from './push-status-row';

/** "Language" on Settings: the one in use, under its own name; a tap opens the list. */
export function LanguageRow() {
  const t = useTranslations('settings');
  const router = useRouter();
  const languages = useConfig().data?.locale.languages ?? [];
  const locale = useLocale();
  const current = languages.find((language) => language.code === locale);

  return (
    <View className="gap-2">
      <Text variant="subheading">{t('language')}</Text>
      <RowGroup>
        <NavRow
          icon="globe"
          title={t('language')}
          value={current?.nativeName}
          onPress={() => router.push('/account/settings/language')}
        />
      </RowGroup>
    </View>
  );
}

/** The languages the store offers, each under its own name. Choosing one is remembered, and leads back. */
export function LanguageList() {
  const t = useTranslations('settings');
  const router = useRouter();
  const config = useConfig().data;
  const locale = useLocale();
  const choose = useLocaleStore((state) => state.choose);

  return (
    <Section title={t('language')}>
      {config?.locale.languages.map((language) => (
        <RadioRow
          key={language.code}
          title={language.nativeName}
          selected={language.code === locale}
          onSelect={() => {
            choose(language.code);
            if (router.canGoBack()) router.back();
          }}
        />
      ))}
    </Section>
  );
}

const CHOICES: ThemeChoice[] = ['light', 'dark', 'system'];

/**
 * Light, dark, or as the device is set. Until the shopper chooses, the app uses the store's theme.
 * Under it, the accent colour of the account screens' wash.
 */
export function ThemePicker() {
  const t = useTranslations('settings');
  const storeMode = useConfig().data?.theme.mode ?? 'light';
  const choice = useThemeStore((state) => state.choice);
  const choose = useThemeStore((state) => state.choose);

  return (
    <>
      <Section title={t('theme')}>
        {CHOICES.map((option) => (
          <RadioRow
            key={option}
            title={t(option)}
            selected={(choice ?? storeMode) === option}
            onSelect={() => choose(option)}
          />
        ))}
      </Section>
      <AccentSection />
      {/* The last sections of Settings: under the theme and the accent, the screen's last pickers. */}
      <PushStatusRow />
      <AppVersion />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="subheading">{title}</Text>
      <RowGroup accessibilityRole="radiogroup" accessibilityLabel={title}>
        {children}
      </RowGroup>
    </View>
  );
}
