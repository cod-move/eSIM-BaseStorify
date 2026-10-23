import { createTranslator } from 'use-intl/core';

import {
  CART_REASONS,
  CHECKOUT_REASONS,
  ERROR_CODES,
  ME_REASONS,
  ORDER_CANCEL_REASONS,
} from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';
import ar from '@/i18n/messages/ar.json';
import bn from '@/i18n/messages/bn.json';
import en from '@/i18n/messages/en.json';

import { describeAuthError, describeAuthRefusal } from '../auth-error-message';

const translator = createTranslator({
  locale: 'en',
  messages: getMessages('en'),
  namespace: 'auth.errors',
});
const t: Parameters<typeof describeAuthError>[1] = (key, values) => translator(key, values);

const errorsTranslator = createTranslator({
  locale: 'en',
  messages: getMessages('en'),
  namespace: 'errors',
});
const tRefusal: Parameters<typeof describeAuthRefusal>[1] = (key) => errorsTranslator(key);

describe('describeAuthError', () => {
  it('says how long a locked account stays locked', () => {
    expect(describeAuthError({ code: 'ACCOUNT_LOCKED', retryAfterSeconds: 840 }, t)).toBe(
      'Too many failed sign-in attempts. This account is locked for 14 minutes.'
    );
    expect(describeAuthError({ code: 'ACCOUNT_LOCKED', retryAfterSeconds: 45 }, t)).toBe(
      'Too many failed sign-in attempts. This account is locked for 45 seconds.'
    );
  });

  it('promises no time when the server gave none', () => {
    expect(describeAuthError({ code: 'ACCOUNT_LOCKED' }, t)).toBe(
      'Too many failed sign-in attempts. This account is locked for a few minutes.'
    );
  });

  it('counts the attempts that are left', () => {
    expect(describeAuthError({ code: 'INVALID_EMAIL_OR_PASSWORD', attemptsRemaining: 1 }, t)).toBe(
      'Wrong email or password. 1 attempt left before this account is locked.'
    );
    expect(describeAuthError({ code: 'INVALID_EMAIL_OR_PASSWORD' }, t)).toBe(
      'Wrong email or password.'
    );
  });

  it('recognises the rate limit, which has a status and no code', () => {
    expect(describeAuthError({ status: 429 }, t)).toBe(
      'Too many attempts from this device. Wait a minute, then try again.'
    );
  });

  it('words what the store answers to "Continue with Google"', () => {
    expect(describeAuthError({ code: 'OAUTH_ACCOUNT_ROLE_CONFLICT', status: 403 }, t)).toBe(
      'Google sign-in is for shopper accounts only. Sign in with your email and password.'
    );
    expect(
      describeAuthError({ code: 'OAUTH_SIGNIN_IS_ONLY_AVAILABLE_FOR_CUSTOMERS', status: 403 }, t)
    ).toBe('Google sign-in is for shopper accounts only. Sign in with your email and password.');
    expect(describeAuthError({ code: 'ID_TOKEN_NOT_SUPPORTED', status: 404 }, t)).toBe(
      'Signing in with Google isn’t available right now. Sign in with your email and password.'
    );
    expect(
      describeAuthError({ code: 'OAUTH_LINK_ERROR', message: 'account not linked', status: 401 }, t)
    ).toBe('An account with this email already exists. Sign in with your email and password.');
    // Its other failures are the store's own trouble: the general sentence.
    expect(
      describeAuthError(
        { code: 'OAUTH_LINK_ERROR', message: 'unable to create user', status: 401 },
        t
      )
    ).toBeNull();
  });

  it('leaves anything else to the caller', () => {
    expect(describeAuthError({ code: 'SOMETHING_ELSE', status: 500 }, t)).toBeNull();
  });

  it('leaves the fixed refusals to describeAuthRefusal', () => {
    expect(describeAuthError({ code: 'EMAIL_NOT_VERIFIED', status: 403 }, t)).toBeNull();
  });
});

// What the auth server (`/api/auth/*`) refuses with besides a wrong password and a limit.
const REFUSALS = [
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_INACTIVE_OR_BANNED',
  'INVALID_ORIGIN',
  'MISSING_OR_NULL_ORIGIN',
  'PASSWORD_POLICY',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
];

/** Throws on a missing message or a missing value, instead of printing the key. */
const fail = (error: Error): never => {
  throw error;
};

const LOCALES = ['en', 'bn', 'ar'] as const;

describe('describeAuthRefusal', () => {
  it('gives an unverified email, a closed account and a refused app a sentence each', () => {
    expect(describeAuthRefusal({ code: 'EMAIL_NOT_VERIFIED', status: 403 }, tRefusal)).toBe(
      "Your email address isn't verified yet. Open the link in the email we sent you, then sign in again."
    );
    expect(describeAuthRefusal({ code: 'ACCOUNT_INACTIVE_OR_BANNED', status: 403 }, tRefusal)).toBe(
      "This account can't sign in right now. Please contact the store."
    );
    expect(describeAuthRefusal({ code: 'INVALID_ORIGIN', status: 403 }, tRefusal)).toBe(
      "Signing in isn't available from this app right now. Please contact the store."
    );
  });

  it('answers a missing origin as it answers a refused one', () => {
    expect(describeAuthRefusal({ code: 'MISSING_OR_NULL_ORIGIN' }, tRefusal)).toBe(
      describeAuthRefusal({ code: 'INVALID_ORIGIN' }, tRefusal)
    );
  });

  it('says at sign-up what the API says of a password and an email', () => {
    expect(describeAuthRefusal({ code: 'PASSWORD_POLICY', status: 400 }, tRefusal)).toBe(
      errorsTranslator('reason.PASSWORD_POLICY')
    );
    expect(describeAuthRefusal({ code: 'USER_ALREADY_EXISTS' }, tRefusal)).toBe(
      errorsTranslator('reason.EMAIL_TAKEN')
    );
    // better-auth 1.6 sends this one when the email is taken.
    expect(describeAuthRefusal({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }, tRefusal)).toBe(
      errorsTranslator('reason.EMAIL_TAKEN')
    );
  });

  it.each(LOCALES)('%s: no refusal is answered "wrong email or password"', (locale) => {
    const messages = getMessages(locale);
    const wrongPassword = createTranslator({ locale, messages, namespace: 'auth.errors' })(
      'invalidCredentials'
    );
    const errors = createTranslator({ locale, messages, namespace: 'errors', onError: fail });

    for (const code of REFUSALS) {
      const sentence = describeAuthRefusal({ code }, (key) => errors(key));
      expect([code, sentence]).not.toEqual([code, null]);
      expect([code, sentence]).not.toEqual([code, wrongPassword]);
    }
  });

  it.each(LOCALES)(
    '%s: an unverified email, a closed account and a refused app differ',
    (locale) => {
      const errors = createTranslator({
        locale,
        messages: getMessages(locale),
        namespace: 'errors',
        onError: fail,
      });
      const sentences = ['EMAIL_NOT_VERIFIED', 'ACCOUNT_INACTIVE_OR_BANNED', 'INVALID_ORIGIN'].map(
        (code) => describeAuthRefusal({ code }, (key) => errors(key))
      );
      expect(new Set(sentences).size).toBe(3);
    }
  );

  it('leaves anything else to the caller', () => {
    expect(
      describeAuthRefusal({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 }, tRefusal)
    ).toBeNull();
    expect(describeAuthRefusal({ code: 'ACCOUNT_LOCKED', status: 429 }, tRefusal)).toBeNull();
    expect(describeAuthRefusal({ status: 429 }, tRefusal)).toBeNull();
    expect(describeAuthRefusal({ code: 'constructor' }, tRefusal)).toBeNull();
    expect(describeAuthRefusal({}, tRefusal)).toBeNull();
  });
});

// The vocabulary of the mobile API: every `code`, and every `reason` of the routes
// that send one. INVALID_RESPONSE is the app's own: the client makes it up for an
// answer that is not the store's and that no status explains.
const CODES = [...ERROR_CODES, 'INVALID_RESPONSE' as const];
const REASONS = [
  ...new Set([...CART_REASONS, ...CHECKOUT_REASONS, ...ME_REASONS, ...ORDER_CANCEL_REASONS]),
];

type Sentences = Record<string, string>;

/** The language's own file, before English fills its gaps. */
const FILES: Record<(typeof LOCALES)[number], { code: Sentences; reason: Sentences }> = {
  en: en.errors,
  bn: bn.errors,
  ar: ar.errors,
};

describe('the error vocabulary', () => {
  it.each(LOCALES)(
    '%s: has a sentence for every code and reason the API sends, and for nothing else',
    (locale) => {
      const { code, reason } = FILES[locale];
      expect(Object.keys(code).sort()).toEqual([...CODES].sort());
      expect(Object.keys(reason).sort()).toEqual([...REASONS].sort());
    }
  );

  it.each(LOCALES)('%s: every sentence is found where the app looks for it', (locale) => {
    const errors = createTranslator({
      locale,
      messages: getMessages(locale),
      namespace: 'errors',
      onError: fail,
    });

    // The app prints a sentence as it is: it has no values to give one. A missing
    // message or a missing value throws here.
    for (const code of CODES) expect(errors(`code.${code}`)).not.toBe('');
    for (const reason of REASONS) expect(errors(`reason.${reason}`)).not.toBe('');
  });

  it.each([
    ['bn', /\p{Script=Bengali}/u],
    ['ar', /\p{Script=Arabic}/u],
  ] as const)(
    '%s: every sentence is written in the language, not copied from English',
    (locale, script) => {
      for (const group of ['code', 'reason'] as const) {
        for (const [key, sentence] of Object.entries(FILES[locale][group])) {
          expect([group, key, script.test(sentence)]).toEqual([group, key, true]);
          expect([group, key, sentence === FILES.en[group][key]]).toEqual([group, key, false]);
        }
      }
    }
  );
});
