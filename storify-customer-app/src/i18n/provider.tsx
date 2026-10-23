import { getCalendars } from 'expo-localization';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { useLocale } from './locale-store';
import { getMessages } from './messages';

/**
 * Gives every screen `useTranslations()` for the app's words and
 * `useFormatter()` for dates and plain numbers, in the app's language and the
 * phone's time zone. Prices are never formatted here: they arrive formatted.
 */
export function I18nProvider({ children }: PropsWithChildren) {
  const locale = useLocale();
  const timeZone = getCalendars()[0]?.timeZone ?? undefined;

  return (
    <IntlProvider locale={locale} messages={getMessages(locale)} timeZone={timeZone}>
      {children}
    </IntlProvider>
  );
}
