import { IntlMessageFormat } from 'intl-messageformat';
import { createTranslator } from 'use-intl/core';

import { BUNDLED_LOCALES } from '../locales';
import { getMessages } from '../messages';
import en from '../messages/en.json';

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...all, [path]: value }
      : { ...all, ...flatten(value, path) };
  }, {});

const english = flatten(en);
/** Examples and codes that no language translates. */
const SAME_IN_EVERY_LANGUAGE = new Set(['auth.emailPlaceholder']);
/** A language's own file, before English fills its gaps. */
const fileOf = (locale: string): Record<string, string> =>
  flatten(jest.requireActual(`../messages/${locale}.json`));

describe('the phone has no Intl.PluralRules and no Intl.Locale', () => {
  it('runs these tests on the polyfills the phone runs on', () => {
    // jest.setup.ts removed the native ones; importing the messages installed these.
    expect((Intl.PluralRules as unknown as { polyfilled?: boolean }).polyfilled).toBe(true);
    expect((Intl.Locale as unknown as { polyfilled?: boolean }).polyfilled).toBe(true);
  });

  it('has the plural rules of every bundled language', () => {
    for (const locale of BUNDLED_LOCALES) {
      getMessages(locale);
      expect(Intl.PluralRules.supportedLocalesOf([locale])).toEqual([locale]);
    }
    // Arabic has six plural forms; English rules would call all of these "other".
    const arabic = new Intl.PluralRules('ar');
    expect([0, 1, 2, 3, 11, 100].map((count) => arabic.select(count))).toEqual([
      'zero',
      'one',
      'two',
      'few',
      'many',
      'other',
    ]);
  });
});

describe('message files', () => {
  it.each(BUNDLED_LOCALES)(
    '%s: every key exists in en.json, and every message is valid ICU',
    (locale) => {
      const messages = fileOf(locale);

      for (const [key, message] of Object.entries(messages)) {
        expect(english).toHaveProperty([key]);
        expect(() => new IntlMessageFormat(message, locale)).not.toThrow();
      }
    }
  );

  // Bengali and Arabic are complete. The other languages hold the strings they
  // share with the store's website, and English fills the rest.
  it.each(['bn', 'ar'])('%s: has a message for every key of en.json', (locale) => {
    const messages = fileOf(locale);
    expect(Object.keys(english).filter((key) => !(key in messages))).toEqual([]);
  });

  // A message left in English reads as a gap in the app. What may be the same: a message with no word
  // in it (`{min} – {max}`, `*`), and the example address of the sign-in form.
  it.each(['bn', 'ar'])('%s: holds no English text', (locale) => {
    const messages = fileOf(locale);
    const sameWords = Object.entries(messages)
      .filter(([key, message]) => message === english[key] && !SAME_IN_EVERY_LANGUAGE.has(key))
      .filter(([, message]) => /[A-Za-z]/.test(message.replace(/\{[^{}]*\}/g, '')))
      .map(([key]) => key);

    expect(sameWords).toEqual([]);
  });

  it.each(BUNDLED_LOCALES)('%s: a message takes the same values as the English one', (locale) => {
    const messages = fileOf(locale);

    for (const [key, message] of Object.entries(messages)) {
      expect([key, new Set(argumentsOf(message))]).toEqual([
        key,
        new Set(argumentsOf(english[key] ?? '')),
      ]);
    }
  });

  it('tells a message’s values from the text of its branches', () => {
    expect(argumentsOf('Hi {name}, {total, number} } left')).toEqual(['name', 'total']);
    expect(
      argumentsOf('{count, plural, =0 {Notifications} one {# from {store}} other {# unread}}')
    ).toEqual(['count', 'store']);
    expect(argumentsOf('{kind, select, gift {Gift} other {{name}’s}}')).toEqual(['kind', 'name']);
  });
});

/**
 * The names of a message's values: `{name}`, `{name, number}`, and those inside
 * the branches of a plural or a select. A branch's own text is not a value,
 * even a single word in braces: `=0 {Notifications}`.
 */
function argumentsOf(message: string): string[] {
  const names: string[] = [];
  let at = 0;

  // Text, up to the brace that closes it or the end.
  const readText = () => {
    while (at < message.length && message[at] !== '}') {
      at += 1;
      if (message[at - 1] === '{') readValue();
    }
  };

  // `name}`, `name, type, style}` or `name, plural, key {text} … }`, after its `{`.
  const readValue = () => {
    const head = /^\s*([a-zA-Z_]\w*)\s*(?:,\s*(\w+))?/.exec(message.slice(at));
    if (head) {
      names.push(head[1] ?? '');
      at += head[0].length;
    }
    const branched = ['plural', 'select', 'selectordinal'].includes(head?.[2] ?? '');
    while (at < message.length && message[at] !== '}') {
      at += 1;
      if (branched && message[at - 1] === '{') {
        readText();
        at += 1;
      }
    }
    at += 1;
  };

  // A stray `}` in the text ends nothing: read on past it.
  while (at < message.length) {
    readText();
    at += 1;
  }
  return names.sort();
}

describe('getMessages', () => {
  it('fills what a language lacks with English', () => {
    expect(fileOf('es')).not.toHaveProperty(['gate.updateTitle']);

    const t = createTranslator({ locale: 'es', messages: getMessages('es') });
    expect(t('gate.updateTitle')).toBe(en.gate.updateTitle);
    expect(t('tabs.cart')).toBe('Carrito');
  });

  it('falls back to English for a language the app does not bundle', () => {
    expect(getMessages('pt-BR')).toBe(en);
  });

  it('formats plurals in the language of the message', () => {
    const arabic = createTranslator({ locale: 'ar', messages: getMessages('ar') });
    expect(arabic('cart.itemCount', { count: 2 })).toBe('منتجان');

    const bengali = createTranslator({ locale: 'bn', messages: getMessages('bn') });
    expect(bengali('product.reviews', { count: 0 })).toBe('এখনো কোনো রিভিউ নেই');

    const englishT = createTranslator({ locale: 'en', messages: getMessages('en') });
    expect(englishT('cart.itemCount', { count: 1 })).toBe('1 item');
    expect(englishT('cart.itemCount', { count: 3 })).toBe('3 items');
  });
});
