import type { Language } from '@/contracts/mobile/shop/v1';

/**
 * The languages the app has translations and plural rules for: the same list
 * the store's web app ships with. Which of them a given store offers comes from
 * the store itself (`/config`), never from this list.
 *
 * Adding a language takes three edits: its code here, its plural rules in
 * `polyfills.ts`, and its translations in `messages/`.
 */
export const BUNDLED_LOCALES = [
  'en',
  'bn',
  'ar',
  'es',
  'fr',
  'de',
  'tr',
  'hi',
  'nl',
  'zh',
  'ja',
  'zu',
  'xh',
  'af',
  'sw',
  'ha',
  'yo',
  'ig',
] as const;

export type BundledLocale = (typeof BUNDLED_LOCALES)[number];

/** Languages written right to left. Arabic is the one bundled; the rest are here for a store that adds them. */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv']);

/** `pt-BR` → `pt` */
export function languageOf(locale: string): string {
  return locale.split('-')[0]?.toLowerCase() ?? locale;
}

export function isRtlLocale(locale: string): boolean {
  return RTL_LANGUAGES.has(languageOf(locale));
}

/**
 * The language to open the app in, for a shopper who has not chosen one: the
 * first of the phone's languages the store offers, else the store's default.
 */
export function pickLocale(
  deviceLocales: readonly string[],
  languages: readonly Language[],
  fallback: string
): string {
  const offered = languages.map((language) => language.code);

  for (const deviceLocale of deviceLocales) {
    const exact = offered.find((code) => code.toLowerCase() === deviceLocale.toLowerCase());
    if (exact) return exact;

    const sameLanguage = offered.find((code) => languageOf(code) === languageOf(deviceLocale));
    if (sameLanguage) return sameLanguage;
  }
  return fallback;
}
