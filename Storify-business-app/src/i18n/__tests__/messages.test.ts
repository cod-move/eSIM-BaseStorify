import { IntlMessageFormat } from 'intl-messageformat';
import { createTranslator } from 'use-intl/core';

import {
  BIZ_UPLOAD_REASONS,
  ERROR_CODES,
  INBOX_REASONS,
  MANUAL_ORDER_REASONS,
  OPERATION_REASONS,
  ORDER_ACTION_REASONS,
  PICTURE_REASONS,
  PRODUCT_EDITOR_REASONS,
  PRODUCT_REASONS,
  RETURN_REASONS,
  VENDOR_APPLICATION_REASONS,
} from '@/contracts/mobile/biz/v1';

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
  // share with the shopper app, and English fills the rest.
  it.each(['bn', 'ar'])('%s: has a message for every key of en.json', (locale) => {
    const messages = fileOf(locale);
    expect(Object.keys(english).filter((key) => !(key in messages))).toEqual([]);
  });

  it.each(BUNDLED_LOCALES)('%s: a message takes the same values as the English one', (locale) => {
    const messages = fileOf(locale);
    const argumentsOf = (message: string) =>
      [...message.matchAll(/\{\s*([a-zA-Z]+)\s*[,}]/g)].map((match) => match[1]).sort();

    for (const [key, message] of Object.entries(messages)) {
      expect([key, new Set(argumentsOf(message))]).toEqual([
        key,
        new Set(argumentsOf(english[key] ?? '')),
      ]);
    }
  });
});

describe('the store’s refusals', () => {
  // A screen words a refusal by its reason, then its code (useErrorMessage).
  // Every one the contract names has its sentence, so no screen falls back to
  // the store's English or to "something went wrong".
  it('has a sentence for every error code of the contract', () => {
    for (const code of ERROR_CODES) expect(english).toHaveProperty([`errors.code.${code}`]);
  });

  it.each([
    ['order actions', ORDER_ACTION_REASONS],
    ['products', PRODUCT_REASONS],
    ['product editing', PRODUCT_EDITOR_REASONS],
    ['manual orders', MANUAL_ORDER_REASONS],
    ['returns and refunds', RETURN_REASONS],
    ['uploads', BIZ_UPLOAD_REASONS],
    ['the profile picture', PICTURE_REASONS],
    ['operation recovery', OPERATION_REASONS],
    ['the inbox', INBOX_REASONS],
    ['vendor applications', VENDOR_APPLICATION_REASONS],
  ])('has a sentence for every reason of %s', (_area, reasons) => {
    for (const reason of reasons) expect(english).toHaveProperty([`errors.reason.${reason}`]);
  });
});

describe('getMessages', () => {
  it('fills what a language lacks with English', () => {
    expect(fileOf('es')).not.toHaveProperty(['gate.updateTitle']);

    const t = createTranslator({ locale: 'es', messages: getMessages('es') });
    expect(t('gate.updateTitle')).toBe(en.gate.updateTitle);
    expect(t('common.retry')).toBe('Intentar de nuevo');
  });

  it('falls back to English for a language the app does not bundle', () => {
    expect(getMessages('pt-BR')).toBe(en);
  });

  it('formats plurals in the language of the message', () => {
    const englishT = createTranslator({ locale: 'en', messages: getMessages('en') });
    expect(englishT('auth.errors.durationMinutes', { count: 1 })).toBe('1 minute');
    expect(englishT('auth.errors.durationMinutes', { count: 15 })).toBe('15 minutes');

    // Arabic has a form for two that English rules would call "other".
    const arabic = createTranslator({ locale: 'ar', messages: getMessages('ar') });
    expect(arabic('auth.errors.durationMinutes', { count: 2 })).toBe('دقيقتين');
    expect(arabic('auth.errors.durationMinutes', { count: 3 })).toBe('3 دقائق');
  });
});
