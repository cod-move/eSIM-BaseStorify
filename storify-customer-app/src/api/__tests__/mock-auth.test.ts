import { API_BASE_PATH, Config } from '@/contracts/mobile/shop/v1';

import { AUTH_SETTINGS, MOCK_TOTP_CODE } from '../mocks/fixtures/auth';
import { confirmMockEmail, sentEmails, setMockAuthSettings } from '../mocks/routes/auth';
import { MOCK_PASSWORD, mockFetch, resetMockServer } from '../mocks/server';
import { ORIGIN } from './mock-helpers';

/**
 * The auth server answers in better-auth's shapes, not the mobile API's, so
 * there is no contract schema to hold them against; these tests hold them
 * against what the real server sends, read from better-auth 1.6.33 and the
 * store's own routes around it.
 */

beforeEach(resetMockServer);

/** One request to the auth server, with the cookie a phone would send. */
async function auth(path: string, init: { body?: unknown; cookie?: string; method?: string } = {}) {
  const response = await mockFetch(`${ORIGIN}/api/auth${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.cookie ? { cookie: init.cookie } : undefined,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null, cookies: cookiesOf(response) };
}

/** The cookies an answer sets, by name: their value, empty for one it clears. */
function cookiesOf(response: Response): Record<string, string> {
  const header = response.headers.get('set-cookie') ?? '';
  return Object.fromEntries(
    header
      .split(/,\s*(?=[^;=\s]+=)/)
      .filter(Boolean)
      .map((cookie) => {
        const [pair = ''] = cookie.split(';');
        const [name = '', ...value] = pair.split('=');
        return [name.trim(), cookie.includes('Max-Age=0') ? '' : value.join('=')];
      })
  );
}

const signIn = (email: string, password = MOCK_PASSWORD) =>
  auth('/sign-in/email', { body: { email, password } });

describe('signing in', () => {
  it('opens a session for any email with the mock password', async () => {
    const { response, body, cookies } = await signIn('nadia@example.com');
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ redirect: false, user: { email: 'nadia@example.com' } });

    const cookie = `better-auth.session_token=${cookies['better-auth.session_token']}`;
    const session = await auth('/get-session', { cookie });
    expect(session.body.user).toMatchObject({ email: 'nadia@example.com', emailVerified: true });
  });

  it('refuses a wrong password the way the auth server does', async () => {
    const { response, body } = await signIn('nadia@example.com', 'nope');
    expect(response.status).toBe(401);
    expect(body).toEqual({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
  });

  it('warns over the last attempts, then locks the email, as the store does', async () => {
    const answers = [];
    for (let attempt = 0; attempt < 5; attempt += 1)
      answers.push(await signIn('nadia@example.com', 'nope'));

    expect(answers.map(({ body }) => body.attemptsRemaining)).toEqual([
      undefined,
      3,
      2,
      1,
      undefined,
    ]);
    const locked = answers[4]!;
    expect(locked.response.status).toBe(429);
    expect(locked.response.headers.get('retry-after')).toBe('900');
    expect(locked.body).toMatchObject({ code: 'ACCOUNT_LOCKED', retryAfterSeconds: 900 });

    // Locked means locked: the right password waits too.
    const again = await signIn('nadia@example.com');
    expect(again.response.status).toBe(429);
    expect(again.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses the ninth sign-in of a minute, with the wait in a header and no code', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1)
      await signIn(`shopper${attempt}@example.com`, 'nope');

    const { response, body } = await signIn('nadia@example.com');
    expect(response.status).toBe(429);
    expect(body).toEqual({ message: 'Too many requests. Please try again later.' });
    expect(Number(response.headers.get('x-retry-after'))).toBeGreaterThan(0);
  });

  it('refuses an email the store wants confirmed first, but only with the right password', async () => {
    const refused = await signIn('unverified@example.com');
    expect(refused.response.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(refused.cookies).toEqual({});

    expect((await signIn('unverified@example.com', 'nope')).response.status).toBe(401);
  });
});

describe('two-step verification', () => {
  async function startTwoStep() {
    const started = await signIn('two-step@example.com');
    return {
      ...started,
      cookie: `better-auth.two_factor=${started.cookies['better-auth.two_factor']}`,
    };
  }

  it('answers the password with a redirect to the code, and no session', async () => {
    const { response, body, cookies } = await startTwoStep();
    expect(response.status).toBe(200);
    expect(body).toEqual({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
    expect(cookies['better-auth.two_factor']).toBeTruthy();
    // Any session the phone held is cleared.
    expect(cookies['better-auth.session_token']).toBe('');
  });

  it('opens the session for the authenticator code', async () => {
    const { cookie } = await startTwoStep();

    const wrong = await auth('/two-factor/verify-totp', { body: { code: '000000' }, cookie });
    expect(wrong.response.status).toBe(401);
    expect(wrong.body).toEqual({ code: 'INVALID_CODE', message: 'Invalid code' });

    const right = await auth('/two-factor/verify-totp', { body: { code: MOCK_TOTP_CODE }, cookie });
    expect(right.response.status).toBe(200);
    expect(right.body.user).toMatchObject({
      email: 'two-step@example.com',
      twoFactorEnabled: true,
    });
    expect(right.cookies['better-auth.session_token']).toBeTruthy();
    expect(right.cookies['better-auth.two_factor']).toBe('');
  });

  it('takes each backup code once', async () => {
    const first = await startTwoStep();
    const used = await auth('/two-factor/verify-backup-code', {
      body: { code: 'ABCDE-12345' },
      cookie: first.cookie,
    });
    expect(used.response.status).toBe(200);

    const second = await startTwoStep();
    const again = await auth('/two-factor/verify-backup-code', {
      body: { code: 'ABCDE-12345' },
      cookie: second.cookie,
    });
    expect(again.response.status).toBe(401);
    expect(again.body.code).toBe('INVALID_BACKUP_CODE');
  });

  it('forgets the sign-in after five wrong codes', async () => {
    const { cookie } = await startTwoStep();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await auth('/two-factor/verify-totp', { body: { code: '000000' }, cookie });
    }

    const sixth = await auth('/two-factor/verify-totp', { body: { code: MOCK_TOTP_CODE }, cookie });
    expect(sixth.response.status).toBe(400);
    expect(sixth.body.code).toBe('TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE');
  });

  it('refuses a code with no sign-in waiting for one', async () => {
    const { response, body } = await auth('/two-factor/verify-totp', {
      body: { code: MOCK_TOTP_CODE },
    });
    expect(response.status).toBe(401);
    expect(body.code).toBe('INVALID_TWO_FACTOR_COOKIE');
  });
});

describe('creating an account', () => {
  const newAccount = { name: 'Rafi Ahmed', email: 'rafi@example.com', password: 'Sunflower7' };

  it('keeps the rules the contract can carry', () => {
    const { passwordPolicy } = AUTH_SETTINGS;
    const auth = { passwordPolicy, emailVerificationRequired: false };
    expect(Config.shape.auth.parse(auth)).toEqual(auth);
  });

  it('creates the account and opens its session', async () => {
    const { response, body, cookies } = await auth('/sign-up/email', { body: newAccount });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ token: expect.any(String), user: { email: 'rafi@example.com' } });
    expect(cookies['better-auth.session_token']).toBe(body.token);

    // The account signs in with the password it was given, not the mock's.
    expect((await signIn('rafi@example.com', 'Sunflower7')).response.status).toBe(200);
    expect((await signIn('rafi@example.com')).response.status).toBe(401);
  });

  it('refuses an email that has an account', async () => {
    await auth('/sign-up/email', { body: newAccount });
    const { response, body } = await auth('/sign-up/email', { body: newAccount });
    expect(response.status).toBe(422);
    expect(body.code).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL');
  });

  it("refuses a password that breaks the store's rules", async () => {
    setMockAuthSettings({
      passwordPolicy: {
        ...AUTH_SETTINGS.passwordPolicy,
        requireUppercase: true,
        requireNumber: true,
      },
    });
    const { response, body } = await auth('/sign-up/email', {
      body: { ...newAccount, password: 'sunflower' },
    });
    expect(response.status).toBe(400);
    expect(body).toEqual({
      code: 'PASSWORD_POLICY',
      message: 'Password must include at least one uppercase letter.',
    });
  });

  it('sends the confirmation link when the store wants one, and refuses the sign-in until then', async () => {
    setMockAuthSettings({ emailVerificationRequired: true });

    const { body, cookies } = await auth('/sign-up/email', { body: newAccount });
    // The store opens a session with the account all the same.
    expect(cookies['better-auth.session_token']).toBeTruthy();
    expect(body.user.emailVerified).toBe(false);
    expect(sentEmails()).toEqual([{ kind: 'verification', to: 'rafi@example.com' }]);

    // It knows the session, but the mobile API refuses it until the link is followed.
    const cookie = `better-auth.session_token=${cookies['better-auth.session_token']}`;
    const profile = () => mockFetch(`${ORIGIN}${API_BASE_PATH}/en/me`, { headers: { cookie } });
    expect((await auth('/get-session', { cookie })).body.user.emailVerified).toBe(false);
    expect((await profile()).status).toBe(401);
    confirmMockEmail('rafi@example.com');
    expect((await profile()).status).toBe(200);
    expect((await auth('/get-session', { cookie })).body.user.emailVerified).toBe(true);

    // (A fresh account for the sign-in: the first one has been confirmed above.)
    await auth('/sign-up/email', { body: { ...newAccount, email: 'omar@example.com' } });
    expect((await signIn('omar@example.com', 'Sunflower7')).body.code).toBe('EMAIL_NOT_VERIFIED');

    const resent = await auth('/send-verification-email', { body: { email: 'omar@example.com' } });
    expect(resent.body).toEqual({ status: true });
    expect(sentEmails()).toHaveLength(3);
  });

  it('refuses a password longer than the store allows', async () => {
    const { response, body } = await auth('/sign-up/email', {
      body: { ...newAccount, password: 'a'.repeat(AUTH_SETTINGS.passwordPolicy.maxLength + 1) },
    });
    expect(response.status).toBe(400);
    expect(body.code).toBe('PASSWORD_POLICY');
  });
});

describe('forgotten password', () => {
  const request = (email: string) => auth('/forgot-password', { body: { email } });

  it('answers the same whether or not the address has an account', async () => {
    const known = await request('two-step@example.com');
    const unknown = await request('nobody@example.com');

    expect(known.body).toEqual(unknown.body);
    expect(known.body).toMatchObject({ success: true });
    expect(sentEmails()).toEqual([{ kind: 'passwordReset', to: 'two-step@example.com' }]);
  });

  it('limits the requests for one address, with the wait in the body and the header', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await request('two-step@example.com');

    const { response, body } = await request('two-step@example.com');
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe(String(body.retryAfter));
    expect(body).toMatchObject({ success: false, code: 'RATE_LIMIT_EXCEEDED' });

    // Another address has its own allowance.
    expect((await request('nadia@example.com')).response.status).toBe(200);
  });

  it('refuses something that is not an email', async () => {
    const { response, body } = await request('nadia');
    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, message: 'Invalid email address' });
  });
});

describe('signing out', () => {
  it("closes this phone's session and leaves the others open", async () => {
    const phone = await signIn('nadia@example.com');
    const laptop = await signIn('nadia@example.com');
    const cookieOf = (answer: typeof phone) =>
      `better-auth.session_token=${answer.cookies['better-auth.session_token']}`;

    const out = await auth('/sign-out', { body: {}, cookie: cookieOf(phone) });
    expect(out.cookies['better-auth.session_token']).toBe('');

    expect((await auth('/get-session', { cookie: cookieOf(phone) })).body).toBeNull();
    expect((await auth('/get-session', { cookie: cookieOf(laptop) })).body.user).toBeTruthy();
  });
});
