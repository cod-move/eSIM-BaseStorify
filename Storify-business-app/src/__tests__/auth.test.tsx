import { act, waitFor } from '@testing-library/react-native';

import { MOCK_TOTP_CODE } from '@/api/mocks/server';
import { useChangePassword, useTwoFactorSettings } from '@/features/auth/use-account-security';
import { useSession } from '@/features/auth/use-session';
import { useSignIn } from '@/features/auth/use-sign-in';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useMe } from '@/features/workspace/use-me';
import { authClient } from '@/lib/auth-client';

import { renderAppHook, signInAs } from './hooks';

describe('signing in', () => {
  function useSignInScreen() {
    return { signIn: useSignIn(), session: useSession() };
  }

  it('signs an operator in', async () => {
    const { result } = await renderAppHook(useSignInScreen);

    await act(() =>
      result.current.signIn.signIn({ email: 'staff@example.com', password: 'password' })
    );

    expect(result.current.signIn.step).toEqual({ name: 'signedIn' });
    await waitFor(() => expect(result.current.session.user?.email).toBe('staff@example.com'));
  });

  it('refuses a shopper, in words, and keeps no session', async () => {
    const { result } = await renderAppHook(useSignInScreen);

    await act(() =>
      result.current.signIn.signIn({ email: 'shopper@example.com', password: 'password' })
    );

    expect(result.current.signIn.error).toEqual({
      code: 'BIZ_APP_OPERATORS_ONLY',
      field: null,
      message:
        "This app is for the people who run the store. To shop, use the store's shopping app.",
    });
    expect(authClient.getCookie()).not.toMatch(/session_token=mock/);
  });

  it('asks an account with two-step verification for its code', async () => {
    const { result } = await renderAppHook(useSignInScreen);

    await act(() =>
      result.current.signIn.signIn({ email: 'two-step@example.com', password: 'password' })
    );
    expect(result.current.signIn.step).toMatchObject({ name: 'twoFactor', method: 'totp' });

    await act(() => result.current.signIn.verifyCode('000000'));
    expect(result.current.signIn.error).toMatchObject({ code: 'INVALID_CODE', field: 'code' });

    await act(() => result.current.signIn.verifyCode(MOCK_TOTP_CODE));
    expect(result.current.signIn.step).toEqual({ name: 'signedIn' });
    await waitFor(() => expect(result.current.session.user?.email).toBe('two-step@example.com'));
  });

  it('words a wrong password with the attempts left near the lock', async () => {
    const { result } = await renderAppHook(useSignInScreen);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(() =>
        result.current.signIn.signIn({ email: 'admin@example.com', password: 'nope' })
      );
    }
    expect(result.current.signIn.error?.message).toBe(
      'Wrong email or password. 3 attempts left before this account is locked.'
    );
  });
});

describe('the account', () => {
  it('signs out of this phone', async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(() => ({ session: useSession(), out: useSignOut() }));
    await waitFor(() => expect(result.current.session.isSignedIn).toBe(true));

    await act(() => result.current.out.signOut());

    await waitFor(() => expect(result.current.session.isSignedIn).toBe(false));
  });

  it("changes the password by the store's rules", async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(useChangePassword);

    await act(() =>
      result.current.changePassword({ currentPassword: 'password', newPassword: 'short' })
    );
    expect(result.current.error).toMatchObject({ code: 'PASSWORD_POLICY', field: 'newPassword' });

    await act(() =>
      result.current.changePassword({ currentPassword: 'wrong', newPassword: 'longer-one-1' })
    );
    expect(result.current.error).toMatchObject({ code: 'INVALID_PASSWORD', field: 'password' });

    await act(() =>
      result.current.changePassword({ currentPassword: 'password', newPassword: 'longer-one-1' })
    );
    expect(result.current.done).toBe(true);
  });

  it('turns two-step verification on with a first code, and off with the password', async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(() => ({
      me: useMe(),
      twoFactor: useTwoFactorSettings(),
    }));
    await waitFor(() => expect(result.current.me.data?.twoFactorEnabled).toBe(false));

    await act(() => result.current.twoFactor.start('password'));
    expect(result.current.twoFactor.setup?.totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(result.current.twoFactor.setup?.backupCodes).toHaveLength(2);

    await act(() => result.current.twoFactor.confirm('654321'));
    await waitFor(() => expect(result.current.me.data?.twoFactorEnabled).toBe(true));

    await act(() => result.current.twoFactor.disable('password'));
    await waitFor(() => expect(result.current.me.data?.twoFactorEnabled).toBe(false));
  });
});
