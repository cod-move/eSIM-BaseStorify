import { languageOf, type BundledLocale } from './locales';
import en from './messages/en.json';
import { loadPluralRules } from './polyfills';

/**
 * The app's own words. The store's words (product names, prices, the text of
 * home blocks) arrive translated from the API.
 *
 * `en.json` is the source: every key lives there. A language's file may hold
 * any part of it, and what it leaves out is shown in English. So a new key is
 * added to `en.json` first and the app works at once in all languages.
 *
 * Messages use ICU syntax, the same as the store's web app.
 */
export type Messages = typeof en;

// Gives `useTranslations` the list of keys, so a misspelt key is a type error.
declare module 'use-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}

type PartialMessages = { [key: string]: string | PartialMessages };

// `require`, not `import`: only the active language's file is read.
const FILES: Record<Exclude<BundledLocale, 'en'>, () => PartialMessages> = {
  bn: () => require('./messages/bn.json'),
  ar: () => require('./messages/ar.json'),
  es: () => require('./messages/es.json'),
  fr: () => require('./messages/fr.json'),
  de: () => require('./messages/de.json'),
  tr: () => require('./messages/tr.json'),
  hi: () => require('./messages/hi.json'),
  nl: () => require('./messages/nl.json'),
  zh: () => require('./messages/zh.json'),
  ja: () => require('./messages/ja.json'),
  zu: () => require('./messages/zu.json'),
  xh: () => require('./messages/xh.json'),
  af: () => require('./messages/af.json'),
  sw: () => require('./messages/sw.json'),
  ha: () => require('./messages/ha.json'),
  yo: () => require('./messages/yo.json'),
  ig: () => require('./messages/ig.json'),
};

const merged = new Map<string, Messages>();

/**
 * The messages of a language, with English wherever the language has no text of
 * its own. The language's plural rules are loaded with them.
 */
export function getMessages(locale: string): Messages {
  const language = languageOf(locale);
  const cached = merged.get(language);
  if (cached) return cached;

  loadPluralRules(language);
  const file = (FILES as Record<string, (() => PartialMessages) | undefined>)[language];
  const messages = file ? (overlay(en, file()) as Messages) : en;
  merged.set(language, messages);
  return messages;
}

function overlay(base: PartialMessages, over: PartialMessages): PartialMessages {
  const result: PartialMessages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const original = base[key];
    // A key English does not have, or has in another shape, is a leftover: it is ignored.
    if (typeof original === 'object' && typeof value === 'object') {
      result[key] = overlay(original, value);
    } else if (typeof original === 'string' && typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}
