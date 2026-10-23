/** The mock store's settings, as GET /config answers them. */
import type { Config } from '@/contracts/mobile/biz/v1';

import { MOCK_CURRENCY, MOCK_LANGUAGES, MOCK_ORIGIN, image } from './shared';

export function config(locale: string): Config {
  return {
    store: {
      name: 'Storify Demo Store',
      logo: image('storify-logo', 'Storify Demo Store'),
      icon: image('storify-icon', 'Storify Demo Store'),
      websiteUrl: `${MOCK_ORIGIN}/`,
      dashboardUrl: `${MOCK_ORIGIN}/${locale}/login`,
    },
    locale: { current: locale, default: 'en', languages: MOCK_LANGUAGES },
    currency: { code: MOCK_CURRENCY },
    theme: {
      mode: 'light',
      brand: {
        light: { primary: '#252525', primaryForeground: '#ffffff' },
        dark: { primary: '#1c1c1c', primaryForeground: '#ffffff' },
      },
    },
    features: { multiVendor: true },
    // No minimum: the mock never asks the app to update.
    app: { ios: { latestVersion: '1.0.0' }, android: { latestVersion: '1.0.0' } },
    auth: {
      passwordPolicy: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: false,
        requireNumber: true,
        requireSpecialCharacter: false,
      },
    },
  };
}
