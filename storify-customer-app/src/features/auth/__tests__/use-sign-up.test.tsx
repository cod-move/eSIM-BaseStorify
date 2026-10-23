import { act } from '@testing-library/react-native';

import { MockError } from '@/api/mocks/kit';
import { routes as accountRoutes } from '@/api/mocks/routes/account';
import { authRoutes, sentEmails, setMockAuthSettings } from '@/api/mocks/routes/auth';
import type { PasswordPolicy } from '@/contracts/mobile/shop/v1';
import { authClient, getSessionCookie } from '@/lib/auth-client';

import { useSignUp } from '../use-sign-up';
import { renderAuthHook, startFresh } from './auth-hook';

beforeEach(startFresh);

const rafi = { name: 'Rafi Ahmed', email: 'rafi@example.com', password: 'Sunflower7' };

const strictPolicy: PasswordPolicy = {
  minLength: 10,
  maxLength: 64,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialCharacter: true,
};

async function signUpHook(auth?: Parameters<typeof renderAuthHook>[1]) {
  const hook = await renderAuthHook(useSignUp, auth);
  const signUp = (values = rafi) => act(() => hook.result.current.signUp(values));
  return { result: hook.result, signUp };
}

describe('useSignUp', () => {
  it('creates the account and signs it in', async () => {
    const { result, signUp } = await signUpHook();

    await signUp();

    expect(result.current.step).toEqual({
      name: 'signedIn',
      user: { name: 'Rafi Ahmed', email: 'rafi@example.com', image: null },
    });
    expect(result.current.error).toBeNull();
    expect(getSessionCookie()).toContain('better-auth.session_token=');
    expect(sentEmails()).toEqual([]);
  });

  it('checks the form against the rules the store sent in its settings', async () => {
    const { result } = await signUpHook({
      auth: { passwordPolicy: strictPolicy, emailVerificationRequired: false },
    });
    const check = (password: string) => result.current.schema.safeParse({ ...rafi, password });

    expect(result.current.policy).toEqual(strictPolicy);
    expect(check('Sunflower7').success).toBe(false);
    expect(check('Sunflower-seed').success).toBe(false);
    expect(check('sunflower-7-seed').success).toBe(false);
    expect(check('Sunflower-7-seed').success).toBe(true);
    // Longer than the store allows.
    expect(check(`Sunflower-7${'x'.repeat(60)}`).success).toBe(false);

    const refused = check('short');
    expect(refused.error?.issues.map((issue) => issue.message)).toContain('passwordRules');
  });

  it("checks the name and the email by the store's limits", async () => {
    const { result } = await signUpHook();
    const fields = (values: Partial<typeof rafi>) =>
      result.current.schema
        .safeParse({ ...rafi, ...values })
        .error?.issues.map((issue) => [issue.path[0], issue.message]);

    expect(fields({})).toBeUndefined();
    expect(fields({ name: 'R' })).toEqual([['name', 'nameTooShort']]);
    expect(fields({ name: 'R'.repeat(101) })).toEqual([['name', 'nameTooLong']]);
    expect(fields({ email: 'rafi' })).toEqual([['email', 'email']]);
    expect(fields({ password: '' })).toContainEqual(['password', 'required']);
  });

  it('asks for no rules while the store has sent none', async () => {
    const { result } = await signUpHook({ auth: null });

    expect(result.current.policy).toBeNull();
    expect(result.current.schema.safeParse({ ...rafi, password: 'x' }).success).toBe(true);
  });

  it("words what the store's own check refuses, beside the password", async () => {
    // The form was given the lenient rules; the store holds the strict ones.
    setMockAuthSettings({ passwordPolicy: strictPolicy });
    const { result, signUp } = await signUpHook();

    await signUp({ ...rafi, password: 'sunflowers' });

    expect(result.current.error).toEqual({
      message: 'This password is too weak. Choose one that meets the rules shown.',
      field: 'password',
      code: 'PASSWORD_POLICY',
    });
    expect(result.current.step).toEqual({ name: 'form' });
    expect(getSessionCookie()).not.toContain('session_token');
  });

  it('refuses an email that has an account, beside the email', async () => {
    const first = await signUpHook();
    await first.signUp();
    // This phone lets the account go; the store still has it.
    await act(async () => {
      await authClient.signOut();
    });

    const { result, signUp } = await signUpHook();
    await signUp();

    expect(result.current.error).toEqual({
      message: 'Another account already uses this email address.',
      field: 'email',
      code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
    });
    expect(result.current.step).toEqual({ name: 'form' });
  });

  it('is signed in but waiting for the email when the store wants it confirmed', async () => {
    setMockAuthSettings({ emailVerificationRequired: true });
    const { result, signUp } = await signUpHook();

    await signUp();

    // The store opens a session, and the mobile API refuses it until the link is followed.
    expect(result.current.step).toEqual({ name: 'verifyEmail', email: 'rafi@example.com' });
    expect(result.current.error).toBeNull();
    expect(sentEmails()).toEqual([{ kind: 'verification', to: 'rafi@example.com' }]);
    expect(getSessionCookie()).toContain('better-auth.session_token=');

    // "Change email address" goes back to the form.
    await act(() => result.current.changeEmail());
    expect(result.current.step).toEqual({ name: 'form' });
  });

  it('shows an error, not success, when the store fails to say whether it accepts the session', async () => {
    setMockAuthSettings({ emailVerificationRequired: true });
    const me = accountRoutes.find(({ method, path }) => method === 'GET' && path === '/me')!;
    const broken = jest.spyOn(me, 'handle').mockImplementation(() => {
      throw new MockError(500, 'INTERNAL_ERROR', 'Internal server error');
    });
    const { result, signUp } = await signUpHook();

    await signUp();

    expect(result.current.step).toEqual({ name: 'form' });
    expect(result.current.error).toEqual({
      message: 'Something went wrong on our end. Please try again later.',
      field: null,
      code: 'INTERNAL_ERROR',
    });
    broken.mockRestore();
  });

  it('says so when no answer comes back', async () => {
    const route = authRoutes.find(({ path }) => path === '/sign-up/email')!;
    const offline = jest.spyOn(route, 'handle').mockImplementation(() => {
      throw new TypeError('Network request failed');
    });
    const { result, signUp } = await signUpHook();

    await signUp();

    expect(result.current.error).toEqual({
      message: 'Please check your internet connection and try again.',
      field: null,
      code: null,
    });
    expect(result.current.step).toEqual({ name: 'form' });
    offline.mockRestore();
  });
});
