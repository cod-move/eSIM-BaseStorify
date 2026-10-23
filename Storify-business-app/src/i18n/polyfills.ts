/**
 * The parts of `Intl` that Hermes, the JavaScript engine on the phone, does not
 * have and that translated messages need: `Intl.Locale`, and `Intl.PluralRules`
 * for every "{count, plural, …}". Each polyfill installs itself only where the
 * real thing is missing, so in a browser this file does nothing.
 *
 * It must be the first import of the root layout.
 *
 * Still missing on the phone, and not polyfilled: `Intl.RelativeTimeFormat`,
 * `Intl.ListFormat`, `Intl.DisplayNames`, `Intl.Segmenter`. So `format.relativeTime`
 * and `format.list` must not be used; the test setup removes all four so that a
 * test fails where the phone would. `Intl.NumberFormat` and `Intl.DateTimeFormat`
 * are there, without `formatToParts`, `formatRange` and compact notation on iOS.
 */
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
// English is always loaded: it is also what a language without rules of its own falls back to.
import '@formatjs/intl-pluralrules/locale-data/en.js';

import { languageOf, type BundledLocale } from './locales';

/* eslint-disable @typescript-eslint/no-require-imports -- loaded on demand: only the active language's rules run */
const PLURAL_RULES: Record<Exclude<BundledLocale, 'en'>, () => void> = {
  bn: () => require('@formatjs/intl-pluralrules/locale-data/bn.js'),
  ar: () => require('@formatjs/intl-pluralrules/locale-data/ar.js'),
  es: () => require('@formatjs/intl-pluralrules/locale-data/es.js'),
  fr: () => require('@formatjs/intl-pluralrules/locale-data/fr.js'),
  de: () => require('@formatjs/intl-pluralrules/locale-data/de.js'),
  tr: () => require('@formatjs/intl-pluralrules/locale-data/tr.js'),
  hi: () => require('@formatjs/intl-pluralrules/locale-data/hi.js'),
  nl: () => require('@formatjs/intl-pluralrules/locale-data/nl.js'),
  zh: () => require('@formatjs/intl-pluralrules/locale-data/zh.js'),
  ja: () => require('@formatjs/intl-pluralrules/locale-data/ja.js'),
  zu: () => require('@formatjs/intl-pluralrules/locale-data/zu.js'),
  xh: () => require('@formatjs/intl-pluralrules/locale-data/xh.js'),
  af: () => require('@formatjs/intl-pluralrules/locale-data/af.js'),
  sw: () => require('@formatjs/intl-pluralrules/locale-data/sw.js'),
  ha: () => require('@formatjs/intl-pluralrules/locale-data/ha.js'),
  yo: () => require('@formatjs/intl-pluralrules/locale-data/yo.js'),
  ig: () => require('@formatjs/intl-pluralrules/locale-data/ig.js'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Makes a language's plural rules available. Call it before the first message in that language. */
export function loadPluralRules(locale: string): void {
  const load = (PLURAL_RULES as Record<string, (() => void) | undefined>)[languageOf(locale)];
  load?.();
}
