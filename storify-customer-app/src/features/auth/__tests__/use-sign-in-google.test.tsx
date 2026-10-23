import { act } from '@testing-library/react-native';

import { MOCK_TOTP_CODE, mockGoogleIdToken } from '@/api/mocks/fixtures/auth';
import { authRoutes, setMockAuthSettings } from '@/api/mocks/routes/auth';
import { getSessionCookie } from '@/lib/auth-client';

import type { GoogleIdToken } from '../google-id-token';
import { useSignIn } from '../use-sign-in';
import { renderAuthHook, startFresh } from './auth-hook';

beforeEach(async () => {
  await startFresh();
  setMockAuthSettings({ googleWebClientId: 'mock-web-client' });
});

async function googleHook() {
  const hook = await renderAuthHook(useSignIn);
  const withGoogle = (result: GoogleIdToken) =>
    act(() => hook.result.current.signInWithGoogle(result));
  const google = (email: string) =>
    withGoogle({ type: 'token', token: mockGoogleIdToken(email), email });
  return { result: hook.result, withGoogle, google };
}

const socialRoute = () => authRoutes.find(({ path }) => path === '/sign-in/social')!;

describe('useSignIn with Google', () => {
  it('signs in with the token, with the same session as a password', async () => {
    const { result, google } = await googleHook();

    await google('gina@example.com');

    expect(result.current.step).toEqual({
      name: 'signedIn',
      user: { name: 'gina', email: 'gina@example.com', image: null },
    });
    expect(result.current.error).toBeNull();
    expect(getSessionCookie()).toContain('better-auth.session_token=');
  });

  it('asks for the code of a two-step account, as after a password', async () => {
    const { result, google } = await googleHook();

    await google('two-step@example.com');
    expect(result.current.step).toMatchObject({ name: 'twoFactor', method: 'totp' });
    expect(getSessionCookie()).not.toContain('session_token');

    await act(() => result.current.verifyCode(MOCK_TOTP_CODE));
    expect(result.current.step).toMatchObject({
      name: 'signedIn',
      user: { email: 'two-step@example.com' },
    });
  });

  it('does nothing when the shopper closes Google’s picker', async () => {
    const asked = jest.spyOn(socialRoute(), 'handle');
    const { result, withGoogle } = await googleHook();

    await withGoogle({ type: 'cancelled' });

    expect(asked).not.toHaveBeenCalled();
    expect(result.current.step).toEqual({ name: 'credentials' });
    expect(result.current.error).toBeNull();
    asked.mockRestore();
  });

  it('says what the phone could not do', async () => {
    const { result, withGoogle } = await googleHook();

    await withGoogle({ type: 'failed' });
    expect(result.current.error?.message).toBe(
      'Google sign-in didn’t work on this device. Please try again.'
    );

    await withGoogle({ type: 'noAccount' });
    expect(result.current.error?.message).toBe(
      'There’s no Google account on this device. Add one in its settings, then try again.'
    );
  });

  it('sends an email whose account is not joined to Google back to the password', async () => {
    const { result, google } = await googleHook();

    await google('unverified@example.com');

    expect(result.current.step).toEqual({ name: 'credentials' });
    expect(result.current.error).toEqual({
      message: 'An account with this email already exists. Sign in with your email and password.',
      field: null,
      code: 'OAUTH_LINK_ERROR',
    });
  });

  it('words a token the store refused, and a store that has switched Google off', async () => {
    const { result, withGoogle } = await googleHook();

    await withGoogle({ type: 'token', token: 'not-from-google', email: null });
    expect(result.current.error?.message).toBe(
      'We couldn’t confirm this sign-in. Please try again.'
    );

    setMockAuthSettings({ googleWebClientId: null });
    await withGoogle({ type: 'token', token: mockGoogleIdToken('gina@example.com'), email: null });
    expect(result.current.error?.message).toBe(
      'Signing in with Google isn’t available right now. Sign in with your email and password.'
    );
  });

  it('says so when no answer comes back', async () => {
    const offline = jest.spyOn(socialRoute(), 'handle').mockImplementation(() => {
      throw new TypeError('Network request failed');
    });
    const { result, google } = await googleHook();

    await google('gina@example.com');

    expect(result.current.error).toEqual({
      message: 'Please check your internet connection and try again.',
      field: null,
      code: null,
    });
    expect(result.current.pendingMethod).toBeNull();
    offline.mockRestore();
  });
});
