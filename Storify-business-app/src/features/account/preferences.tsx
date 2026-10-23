import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { NavRow } from '@/components/ui/rows';
import { ConfirmSheet, PickerSheet } from '@/components/ui/sheet';
import { useConfig } from '@/features/config/use-config';
import { useLocale, useLocaleStore } from '@/i18n/locale-store';
import { isRtlLocale } from '@/i18n/locales';
import { useThemeStore, type ThemeChoice } from '@/theme/theme-store';

/**
 * The language row: the store's languages in their own names. A change
 * between a left-to-right and a right-to-left language restarts the app once
 * (`i18n/direction.ts`), so the app says so and asks first.
 */
export function LanguageRow() {
  const t = useTranslations('account.language');
  const config = useConfig();
  const locale = useLocale();
  const choose = useLocaleStore((state) => state.choose);
  const [picking, setPicking] = useState(false);
  const [restartTo, setRestartTo] = useState<string | null>(null);
  const languages = config.data?.locale.languages ?? [];
  const current = languages.find((language) => language.code === locale);
  const pending = languages.find((language) => language.code === restartTo);

  return (
    <>
      <NavRow
        icon="globe"
        title={t('title')}
        value={current?.nativeName ?? locale}
        onPress={() => setPicking(true)}
      />
      <PickerSheet
        visible={picking}
        title={t('title')}
        value={locale}
        onClose={() => setPicking(false)}
        onChoose={(code) => {
          if (isRtlLocale(code) !== isRtlLocale(locale)) setRestartTo(code);
          else choose(code);
        }}
        options={languages.map((language) => ({
          value: language.code,
          title: language.nativeName,
          description: language.nativeName === language.name ? undefined : language.name,
        }))}
      />
      <ConfirmSheet
        visible={restartTo !== null}
        title={t('restartTitle', { language: pending?.nativeName ?? '' })}
        body={t('restartBody')}
        confirmLabel={t('restartConfirm')}
        cancelLabel={t('restartCancel')}
        onCancel={() => setRestartTo(null)}
        onConfirm={() => {
          if (restartTo) choose(restartTo);
          setRestartTo(null);
        }}
      />
    </>
  );
}

const THEMES = ['light', 'dark', 'system'] as const satisfies readonly ThemeChoice[];

/**
 * The appearance row: light, dark, or the phone's setting. With no choice the
 * app wears the store's mode.
 */
export function AppearanceRow() {
  const t = useTranslations('account.appearance');
  const choice = useThemeStore((state) => state.choice);
  const choose = useThemeStore((state) => state.choose);
  const [picking, setPicking] = useState(false);

  return (
    <>
      <NavRow
        icon="appearance"
        title={t('title')}
        value={choice ? t(choice) : t('store')}
        onPress={() => setPicking(true)}
      />
      <PickerSheet
        visible={picking}
        title={t('title')}
        value={choice}
        onClose={() => setPicking(false)}
        onChoose={choose}
        options={THEMES.map((theme) => ({
          value: theme,
          title: t(theme),
          description: theme === 'system' ? t('systemHint') : undefined,
        }))}
      />
    </>
  );
}
