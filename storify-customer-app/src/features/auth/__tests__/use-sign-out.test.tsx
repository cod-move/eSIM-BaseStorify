import { act } from '@testing-library/react-native';

import { authRoutes } from '@/api/mocks/routes/auth';
import { MOCK_PASSWORD, mockFetch } from '@/api/mocks/server';
import { env } from '@/config/env';
import { authClient, getSessionCookie } from '@/lib/auth-client';
import { secureStorage } from '@/lib/secure-storage';
import { SECURE_KEYS } from '@/lib/storage-keys';

import { addSignOutTask } from '../sign-out-tasks';
import { useSignOut } from '../use-sign-out';
import { renderAuthHook, startFresh } from './auth-hook';

beforeEach(startFresh);

async function signedInHook() {
  await act(async () => {
    await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
  });
  const cookie = getSessionCookie();
  const hook = await renderAuthHook(useSignOut);
  const signOut = () => act(() => hook.result.current.signOut());
  /** Who the store thinks owns this cookie: `null` once the session is closed. */
  const sessionOf = async () => {
    const response = await mockFetch(`${env.apiUrl}/api/auth/get-session`, {
      headers: { cookie },
    });
    return response.json();
  };
  return { result: hook.result, signOut, sessionOf };
}

describe('useSignOut', () => {
  it('runs the sign-out tasks while the session still works, then closes it', async () => {
    const { result, signOut, sessionOf } = await signedInHook();
    const seen: unknown[] = [];
    const remove = addSignOutTask(async () => {
      seen.push({ cookie: getSessionCookie(), session: (await sessionOf())?.user?.email });
    });

    await signOut();
    remove();

    expect(seen).toEqual([
      {
        cookie: expect.stringContaining('better-auth.session_token='),
        session: 'nadia@example.com',
      },
    ]);
    expect(await sessionOf()).toBeNull();
    expect(getSessionCookie()).not.toContain('session_token');
    expect(result.current.isPending).toBe(false);
  });

  it('signs out when a task fails', async () => {
    const { signOut, sessionOf } = await signedInHook();
    const remove = addSignOutTask(() => Promise.reject(new Error('push token not removed')));

    await signOut();
    remove();

    expect(await sessionOf()).toBeNull();
    expect(getSessionCookie()).not.toContain('session_token');
  });

  it("forgets the guest cart's token, so the next shopper starts with an empty cart", async () => {
    const { signOut } = await signedInHook();
    secureStorage.setItem(SECURE_KEYS.cartToken, 'cart-token');

    await signOut();

    expect(secureStorage.getItem(SECURE_KEYS.cartToken)).toBeNull();
  });

  it('forgets the session on this phone when the store cannot be reached', async () => {
    const { signOut } = await signedInHook();
    const route = authRoutes.find(({ path }) => path === '/sign-out')!;
    const offline = jest.spyOn(route, 'handle').mockImplementation(() => {
      throw new TypeError('Network request failed');
    });

    await signOut();

    expect(getSessionCookie()).not.toContain('session_token');
    offline.mockRestore();
  });
});
