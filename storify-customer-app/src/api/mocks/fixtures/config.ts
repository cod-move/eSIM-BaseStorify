/** The mock store's settings, as `GET /config` sends them. */
import type { Config, ImageSet } from '@/contracts/mobile/shop/v1';

import { CURRENCY, MOCK_LANGUAGES } from './shared';

/** The store's wordmark as an SVG, as stores upload it: a mark and the name, for a light or a dark ground. */
function wordmark(ink: string): ImageSet {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 119 37">' +
    '<rect y="4" width="29" height="29" rx="8" fill="#4338ca"/>' +
    `<text x="36" y="26" font-family="sans-serif" font-size="19" font-weight="700" fill="${ink}">Demo</text>` +
    '</svg>';
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return { thumb: uri, card: uri, full: uri, alt: 'Storify Demo' };
}

/** The store's square mark, as an uploaded app icon: the mark of the wordmark, on its own. */
function mark(): ImageSet {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" fill="#4338ca"/>' +
    '<text x="32" y="44" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="700" fill="#ffffff">D</text>' +
    '</svg>';
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return { thumb: uri, card: uri, full: uri, alt: 'Storify Demo' };
}

export function config(locale: string): Config {
  return {
    store: {
      name: 'Storify Demo',
      websiteUrl: 'https://mock.storify.invalid',
      logo: wordmark('#252525'),
      logoDark: wordmark('#ffffff'),
      icon: mark(),
    },
    locale: {
      current: locale,
      default: 'en',
      languages: MOCK_LANGUAGES,
    },
    currency: { code: CURRENCY },
    theme: {
      mode: 'light',
      brand: {
        light: { primary: '#4338ca', primaryForeground: '#ffffff' },
        dark: { primary: '#a5b4fc', primaryForeground: '#1e1b4b' },
      },
    },
    features: {
      multiVendor: true,
      wishlist: true,
      reviews: true,
      guestCheckout: true,
      quotes: false,
      preOrders: true,
    },
    app: {
      ios: { minVersion: '1.0.0', latestVersion: '1.0.0' },
      android: { minVersion: '1.0.0', latestVersion: '1.0.0' },
    },
    pages: {
      privacyPolicyUrl: 'https://mock.storify.invalid/privacy',
      termsUrl: 'https://mock.storify.invalid/terms',
      accountDeletionUrl: 'https://mock.storify.invalid/account-deletion',
    },
    auth: {
      passwordPolicy: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: false,
        requireNumber: false,
        requireSpecialCharacter: false,
      },
      emailVerificationRequired: false,
    },
  };
}
