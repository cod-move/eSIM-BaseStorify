import { getLocales } from 'expo-localization';
import { useEffect } from 'react';

import { isApiError, localeNotAvailable } from '@/api/errors';
import { env } from '@/config/env';
import type { Config } from '@/contracts/mobile/biz/v1';
import { useLocaleStore } from '@/i18n/locale-store';
import { pickLocale } from '@/i18n/locales';

/**
 * Settles which language the app runs in, once the store has said which ones
 * it offers.
 *
 * A language the operator chose in the app stays, as long as the store still
 * offers it. Otherwise the app takes the first of the phone's languages that
 * the store offers, and the store's default when none matches.
 */
export function useLocaleSync(config: Config | undefined, configError: unknown): void {
  useEffect(() => {
    if (!config) return;

    const { locale, chosen, adopt } = useLocaleStore.getState();
    const offered = config.locale.languages.some((language) => language.code === locale);
    if (chosen && offered) return;

    const best = pickLocale(
      getLocales().map((deviceLocale) => deviceLocale.languageTag),
      config.locale.languages,
      config.locale.default
    );
    if (best !== locale) adopt(best);
  }, [config]);

  // The store answers LOCALE_NOT_AVAILABLE to a language it does not offer (any
  // more) and names the one it does. Without this the app would keep asking for
  // the first and never open again. Any other refusal of the settings, such as
  // ROUTE_NOT_FOUND (the store's business API is off), is not a language problem.
  useEffect(() => {
    if (!isApiError(configError) || configError.code !== 'LOCALE_NOT_AVAILABLE') return;

    const fallback = localeNotAvailable(configError)?.defaultLocale ?? env.defaultLocale;
    const { locale, adopt } = useLocaleStore.getState();
    if (locale !== fallback) adopt(fallback);
  }, [configError]);
}
