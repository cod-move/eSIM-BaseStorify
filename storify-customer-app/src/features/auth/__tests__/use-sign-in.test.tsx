import { act } from '@testing-library/react-native';

import { MOCK_TOTP_CODE } from '@/api/mocks/fixtures/auth';
import { authRoutes } from '@/api/mocks/routes/auth';
import { MOCK_PASSWORD } from '@/api/mocks/server';
import { getSessionCookie } from '@/lib/auth-client';

import { useSignIn } from '../use-sign-in';
import { renderAuthHook, startFresh } from './auth-hook';

beforeEach(startFresh);

async function signInHook() {
  const hook = await renderAuthHook(useSignIn);
  const signIn = (email: string, password = MOCK_PASSWORD) =>
    act(() => hook.result.current.signIn({ email, password }));
  const verifyCode = (code: string) => act(() => hook.result.current.verifyCode(code));
  return { result: hook.result, signIn, verifyCode };
}

describe('useSignIn', () => {
  it('signs in, and says who the store let in', async () => {
    const { result, signIn } = await signInHook();

    await signIn('nadia@example.com');

    expect(result.current.step).toEqual({
      name: 'signedIn',
      user: { name: 'nadia', email: 'nadia@example.com', image: null },
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(getSessionCookie()).toContain('better-auth.session_token=');
  });

  it("words a wrong password, the attempts left, then the store's lockout", async () => {
    const { result, signIn } = await signInHook();

    const messages = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn('nadia@example.com', 'wrong');
      messages.push(result.current.error?.message);
    }

    expect(messages).toEqual([
      'Wrong email or password.',
      'Wrong email or password. 3 attempts left before this account is locked.',
      'Wrong email or password. 2 attempts left before this account is locked.',
      'Wrong email or password. 1 attempt left before this account is locked.',
      'Too many failed sign-in attempts. This account is locked for 15 minutes.',
    ]);
    // The whole form, not one field: the store does not say which one was wrong.
    expect(result.current.error?.field).toBeNull();
    expect(result.current.step).toEqual({ name: 'credentials' });
  });

  it("words the store's rate limit with the wait it sends", async () => {
    const { result, signIn } = await signInHook();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await signIn(`shopper${attempt}@example.com`, 'wrong');
    }
    await signIn('nadia@example.com');

    expect(result.current.error?.message).toBe('Too many attempts. Wait 1 minute, then try again.');
    expect(result.current.step).toEqual({ name: 'credentials' });
  });

  it('sends a double tap to the store once', async () => {
    const { result } = await signInHook();

    await act(async () => {
      const values = { email: 'nadia@example.com', password: 'wrong' };
      await Promise.all([result.current.signIn(values), result.current.signIn(values)]);
    });
    await act(() => result.current.signIn({ email: 'nadia@example.com', password: 'wrong' }));

    // Two attempts counted, not three: the warning starts at the second.
    expect(result.current.error?.message).toBe(
      'Wrong email or password. 3 attempts left before this account is locked.'
    );
  });

  it('moves to the code for a two-step account, then signs in with it', async () => {
    const { result, signIn, verifyCode } = await signInHook();

    await signIn('two-step@example.com');
    expect(result.current.step).toEqual({
      name: 'twoFactor',
      email: 'two-step@example.com',
      method: 'totp',
      canUseAuthenticator: true,
    });
    // No session until the code is in.
    expect(getSessionCookie()).not.toContain('session_token');

    await verifyCode('000000');
    expect(result.current.error).toEqual({
      message: 'That code isn’t right. Check your authenticator app and try again.',
      field: 'code',
      code: 'INVALID_CODE',
    });

    // Spaces from a pasted code do not matter.
    await verifyCode(` ${MOCK_TOTP_CODE.slice(0, 3)} ${MOCK_TOTP_CODE.slice(3)} `);
    expect(result.current.step).toMatchObject({
      name: 'signedIn',
      user: { email: 'two-step@example.com' },
    });
    expect(result.current.error).toBeNull();
    expect(getSessionCookie()).toContain('better-auth.session_token=');
  });

  it('takes a backup code instead, once', async () => {
    const { result, signIn, verifyCode } = await signInHook();

    await signIn('two-step@example.com');
    await act(() => result.current.switchMethod('backupCode'));
    expect(result.current.step).toMatchObject({ name: 'twoFactor', method: 'backupCode' });

    await verifyCode('ABCDE-12345');
    expect(result.current.step).toMatchObject({ name: 'signedIn' });
  });

  it('starts again from the password after five wrong codes', async () => {
    const { result, signIn, verifyCode } = await signInHook();

    await signIn('two-step@example.com');
    for (let attempt = 0; attempt < 5; attempt += 1) await verifyCode('000000');
    expect(result.current.step).toMatchObject({ name: 'twoFactor' });

    await verifyCode(MOCK_TOTP_CODE);
    expect(result.current.step).toEqual({ name: 'credentials' });
    expect(result.current.error?.message).toBe(
      'Too many wrong codes. Sign in again to get another try.'
    );
  });

  it('sends an email still to be confirmed to "check your email", with no error', async () => {
    const { result, signIn } = await signInHook();

    await signIn(' unverified@example.com ');

    expect(result.current.step).toEqual({ name: 'verifyEmail', email: 'unverified@example.com' });
    expect(result.current.error).toBeNull();

    await act(() => result.current.restart());
    expect(result.current.step).toEqual({ name: 'credentials' });
  });

  it('says so when no answer comes back', async () => {
    const route = authRoutes.find(({ path }) => path === '/sign-in/email')!;
    const offline = jest.spyOn(route, 'handle').mockImplementation(() => {
      throw new TypeError('Network request failed');
    });
    const { result, signIn } = await signInHook();

    await signIn('nadia@example.com');

    expect(result.current.error).toEqual({
      message: 'Please check your internet connection and try again.',
      field: null,
      code: null,
    });
    expect(result.current.isPending).toBe(false);
    offline.mockRestore();
  });
});
