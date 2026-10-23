import { act } from '@testing-library/react-native';

import { api } from '@/api/api';
import { getMe } from '@/api/endpoints/me';
import { SESSION_COOKIE } from '@/api/mocks/kit';
import { authRoutes, MOCK_PASSWORD } from '@/api/mocks/routes/auth';
import { state } from '@/api/mocks/state';
import { transport } from '@/api/transport';
import { startFresh } from '@/features/auth/__tests__/auth-hook';
import { useLocaleStore } from '@/i18n/locale-store';
import { authClient, getSessionCookie } from '@/lib/auth-client';

// The app's own client on the mock store; a test may put a canned answer in front of it.
jest.mock('@/api/transport', () => {
  const actual = jest.requireActual<typeof import('@/api/transport')>('@/api/transport');
  return { transport: jest.fn(actual.transport) };
});

const sent = jest.mocked(transport);
const urlsTo = (path: string) =>
  sent.mock.calls.map(([input]) => String(input)).filter((url) => url.endsWith(path));

beforeEach(async () => {
  sent.mockClear();
  await startFresh();
});

describe('a language the store does not serve', () => {
  afterEach(() => useLocaleStore.getState().adopt('en'));

  it('adopts the default language the store names and asks once more in it', async () => {
    sent.mockImplementationOnce(async () =>
      Response.json(
        {
          success: false,
          code: 'LOCALE_NOT_AVAILABLE',
          message: 'Locale not available',
          details: { defaultLocale: 'bn', locales: ['bn', 'en'] },
        },
        { status: 404 }
      )
    );

    await expect(api.data({ locale: 'fr', path: '/categories' })).resolves.toBeDefined();

    expect(useLocaleStore.getState().locale).toBe('bn');
    expect(urlsTo('/categories')).toEqual([
      expect.stringContaining('/fr/categories'),
      expect.stringContaining('/bn/categories'),
    ]);
  });
});

describe('a session the API refuses', () => {
  const getSession = authRoutes.find(({ path }) => path === '/get-session')!;

  /** Signs Nadia in, then has the API forget her session, as when it expires. */
  async function signedInThenRefused() {
    await act(async () => {
      await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
    });
    const [nadia] = [...state.sessions.values()];
    state.sessions.clear();
    return nadia!;
  }

  /** What the store answers when it renews the session into `token` (or confirms it, with no cookie). */
  function sessionAnswer(user: { id: string; name: string; email: string }, token?: string) {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const headers = new Headers({ 'content-type': 'application/json' });
    if (token) headers.append('set-cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly`);
    return new Response(
      JSON.stringify({
        session: { id: 'session_renewed', userId: user.id, expiresAt, token: 'mock' },
        user: { ...user, emailVerified: true },
      }),
      { headers }
    );
  }

  afterEach(() => jest.restoreAllMocks());

  it('renews the session once and repeats the refused request once', async () => {
    const nadia = await signedInThenRefused();
    jest.spyOn(getSession, 'handle').mockImplementationOnce(() => {
      state.sessions.set('renewed', nadia);
      return sessionAnswer(nadia, 'renewed');
    });

    const me = await act(() => getMe('en', new AbortController().signal));

    expect(me.email).toBe('nadia@example.com');
    expect(urlsTo('/en/me')).toHaveLength(2);
    expect(getSessionCookie()).toContain(`${SESSION_COOKIE}=renewed`);
  });

  it('signs out, and repeats nothing, when the store has dropped the session', async () => {
    await signedInThenRefused();

    await act(() => expect(getMe('en', new AbortController().signal)).rejects.toThrow());

    expect(urlsTo('/en/me')).toHaveLength(1);
    expect(getSessionCookie()).toBe('');
  });

  it('signs out after a second refusal, with no third request', async () => {
    const nadia = await signedInThenRefused();
    // Renewed into a cookie the API refuses as well; the store still confirms it.
    jest
      .spyOn(getSession, 'handle')
      .mockImplementationOnce(() => sessionAnswer(nadia, 'renewed'))
      .mockImplementationOnce(() => sessionAnswer(nadia));

    await act(() => expect(getMe('en', new AbortController().signal)).rejects.toThrow());

    expect(urlsTo('/en/me')).toHaveLength(2);
    expect(getSessionCookie()).toBe('');
  });
});
