/**
 * What every area's data is made with: the store's languages and currency,
 * prices and pictures.
 *
 * The mock plays the server, so it does what the app itself must never do:
 * `money` formats a price, as the store does for its currency and language.
 */
import type { ImageSet, Language, Money } from '@/contracts/mobile/shop/v1';

export const MOCK_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
];

export const CURRENCY = 'USD';

export function money(amount: number, locale: string): Money {
  // Latin digits in every language, as the store prints them.
  const formatted = new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    style: 'currency',
    currency: CURRENCY,
  }).format(amount);
  return { amount, currency: CURRENCY, formatted };
}

export function picture(seed: string, alt: string, ratio = 1): ImageSet {
  const url = (width: number) =>
    `https://picsum.photos/seed/${seed}/${width}/${Math.round(width / ratio)}`;
  return { thumb: url(256), card: url(640), full: url(1080), alt };
}
