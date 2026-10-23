import {
  captchaUrl,
  needsCaptchaToken,
  parseCaptchaMessage,
} from '@/features/checkout/captcha-bridge';

// The web view is native; the logic under test is not.
jest.mock('react-native-webview', () => ({ WebView: () => null }));

describe('needsCaptchaToken', () => {
  it('holds the order back while a quote asking for the check has no token', () => {
    expect(needsCaptchaToken({ required: true }, undefined)).toBe(true);
    expect(needsCaptchaToken({ required: true }, '')).toBe(true);
  });

  it('lets the order go with the token, or when no check is asked', () => {
    expect(needsCaptchaToken({ required: true }, 'tok')).toBe(false);
    expect(needsCaptchaToken({ required: false }, undefined)).toBe(false);
  });
});

describe('parseCaptchaMessage', () => {
  const nonce = 'n-1';
  const send = (message: object) => parseCaptchaMessage(JSON.stringify(message), nonce);

  it('takes the token of a message that carries the nonce', () => {
    expect(send({ type: 'turnstile', token: 'tok', nonce })).toEqual({
      kind: 'token',
      token: 'tok',
    });
  });

  it('ignores a message of another check, or without a nonce', () => {
    expect(send({ type: 'turnstile', token: 'tok', nonce: 'other' })).toBeUndefined();
    expect(send({ type: 'turnstile', token: 'tok' })).toBeUndefined();
  });

  it('ignores anything that is not a message of the check', () => {
    expect(parseCaptchaMessage('not json', nonce)).toBeUndefined();
    expect(parseCaptchaMessage('"turnstile"', nonce)).toBeUndefined();
    expect(send({ type: 'turnstile', token: '', nonce })).toBeUndefined();
    expect(send({ type: 'turnstile', token: 'x'.repeat(4001), nonce })).toBeUndefined();
    expect(send({ type: 'other', nonce })).toBeUndefined();
  });

  it('reads a lapsed token, and an error or a missing check as a failure', () => {
    expect(send({ type: 'turnstile-expired', nonce })).toEqual({ kind: 'expired' });
    expect(send({ type: 'turnstile-error', nonce })).toEqual({ kind: 'failed' });
    expect(send({ type: 'turnstile-unavailable', nonce })).toEqual({ kind: 'failed' });
  });
});

describe('captchaUrl', () => {
  it('adds the nonce to the store page, with or without a query', () => {
    expect(captchaUrl('https://s.test/en/app/captcha', 'a b')).toBe(
      'https://s.test/en/app/captcha?nonce=a%20b'
    );
    expect(captchaUrl('https://s.test/en/app/captcha?x=1#top', 'n')).toBe(
      'https://s.test/en/app/captcha?x=1&nonce=n'
    );
  });
});
