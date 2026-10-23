/**
 * The store's auth server, `/api/auth/*`, answering as the real one does:
 * better-auth's endpoints and shapes, with what the store adds around them (its
 * lockout, its password rules, its own forgot-password route). That shape is
 * not the mobile API's envelope, so each route returns its whole response.
 *
 * Its accounts, settings and limits are in `fixtures/auth.ts`, which says what
 * to sign in with.
 */
import { Platform } from 'react-native';

import {
  ACCOUNTS,
  AUTH_SETTINGS,
  LOCKOUT,
  MOCK_PASSWORD,
  RATE_LIMITS,
  TWO_FACTOR,
  type MockAccount,
  type MockAuthSettings,
} from '../fixtures/auth';
import { SESSION_COOKIE, type MockAuthContext, type MockAuthRoute } from '../kit';
import { state, type MockUser } from '../state';

export { MOCK_PASSWORD } from '../fixtures/auth';

/** The cookie that carries a two-step sign-in from the password to the code. */
const TWO_FACTOR_COOKIE = 'better-auth.two_factor';
/** The session's cached copy, which the real server sets beside the token. */
const SESSION_DATA_COOKIE = 'better-auth.session_data';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
/** Longer than this, better-auth refuses a password whatever the store's rules. */
const MAX_PASSWORD_LENGTH = 128;

type Account = MockUser &
  Omit<MockAccount, 'twoFactor'> & {
    twoFactor?: {
      totpCode: string;
      /** Each code works once. */
      backupCodes: Set<string>;
      /** Wrong codes in a row, across sign-ins. */
      failures: number;
      lockedUntil: number;
    };
  };

/** A sign-in waiting for its second step. */
type Challenge = { email: string; attempts: number; expiresAt: number };

/** An email the store sent, kept so a test can see it went out. */
export type MockEmail = { kind: 'verification' | 'passwordReset'; to: string };

// What the auth server remembers. `reset` forgets it and seeds the accounts.
let settings: MockAuthSettings = AUTH_SETTINGS;
/**
 * Sessions the store minted for an email it still wants confirmed. It refuses
 * them everywhere but `get-session` (the mobile API answers 401), until the
 * link is followed.
 */
const unconfirmedSessions = new Map<string, Account>();
const accounts = new Map<string, Account>();
const failedSignIns = new Map<string, { attempts: number; lockedUntil: number }>();
const requestTimes = new Map<string, number[]>();
const challenges = new Map<string, Challenge>();
/** A browser keeps the two-step cookie itself and hides it from scripts: this stands in for it. */
let browserChallenge: string | null = null;
const outbox: MockEmail[] = [];

export function reset(): void {
  settings = AUTH_SETTINGS;
  unconfirmedSessions.clear();
  accounts.clear();
  for (const account of ACCOUNTS) addAccount(account);
  failedSignIns.clear();
  requestTimes.clear();
  challenges.clear();
  browserChallenge = null;
  outbox.length = 0;
}
reset();

/**
 * Changes how the store has sign-up set, until the next reset: for a test of a
 * store that wants new accounts to confirm their email.
 */
export function setMockAuthSettings(next: Partial<MockAuthSettings>): void {
  settings = { ...settings, ...next };
}

/** How the store has sign-in set now, for `GET /config`. */
export function mockAuthSettings(): MockAuthSettings {
  return settings;
}

/**
 * Follows the link of a verification email: the address is confirmed, and the
 * session minted at sign-up starts working, as it does on the real store.
 */
export function confirmMockEmail(email: string): void {
  const account = accounts.get(email.trim().toLowerCase());
  if (!account) return;
  account.emailVerified = true;
  for (const [token, held] of unconfirmedSessions) {
    if (held !== account) continue;
    unconfirmedSessions.delete(token);
    state.sessions.set(token, { id: account.id, name: account.name, email: account.email });
  }
}

/** The emails the store has sent since the last reset. */
export function sentEmails(): readonly MockEmail[] {
  return [...outbox];
}

export const authRoutes: MockAuthRoute[] = [
  {
    method: 'POST',
    path: '/sign-in/email',
    handle: (ctx) => {
      const { email, password } = fieldsOf(ctx);
      const key = email.trim().toLowerCase();

      // The store's lockout runs before better-auth: a locked email costs no
      // password check and does not count against the rate limit.
      const locked = lockedFor(key);
      if (locked) return lockedOut(locked);
      const wait = spend('/sign-in/email');
      if (wait) return tooManyRequests(wait);
      if (!isEmail(key)) return answer(400, { code: 'INVALID_EMAIL', message: 'Invalid email' });

      const account = accountSigningIn(key, password);
      if (!account) {
        const failure = recordFailedSignIn(key);
        // The attempt that trips the lock says so at once.
        if (failure.locked) return lockedOut(LOCKOUT.seconds);
        return answer(401, {
          code: 'INVALID_EMAIL_OR_PASSWORD',
          message: 'Invalid email or password',
          ...(failure.attemptsRemaining === null
            ? {}
            : { attemptsRemaining: failure.attemptsRemaining }),
        });
      }

      // The store's session hook: the password was right, but the email is not
      // confirmed yet. Not a failed attempt, and not a success either.
      if (account.mustConfirmEmail && !account.emailVerified) {
        return answer(403, {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email address before signing in.',
        });
      }
      failedSignIns.delete(key);
      return signInOf(account);
    },
  },
  {
    // "Continue with Google": an ID token from the phone's Google SDK. The
    // store checks it, makes a shopper's account for a new email, joins Google
    // to an existing one whose email is confirmed, and then answers as the
    // password sign-in does, two-step challenge included.
    method: 'POST',
    path: '/sign-in/social',
    handle: (ctx) => {
      const body = (typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}) as {
        provider?: unknown;
        idToken?: { token?: unknown };
      };
      const wait = spend('/sign-in/social');
      if (wait) return tooManyRequests(wait);
      // A provider the store has not switched on is one better-auth does not know.
      if (body.provider !== 'google' || !settings.googleWebClientId) {
        return answer(404, { code: 'PROVIDER_NOT_FOUND', message: 'Provider not found' });
      }
      const token = typeof body.idToken?.token === 'string' ? body.idToken.token : '';
      const email = token.startsWith('mock-google:') ? token.slice('mock-google:'.length) : '';
      const key = email.trim().toLowerCase();
      if (!isEmail(key)) return answer(401, { code: 'INVALID_TOKEN', message: 'Invalid token' });

      const known = accounts.get(key);
      // better-auth's linking rule: an account whose own email is unconfirmed is not joined.
      if (known && !known.emailVerified) {
        return answer(401, { code: 'OAUTH_LINK_ERROR', message: 'account not linked' });
      }
      const account =
        known ??
        addAccount({
          email: key,
          name: key.split('@')[0] ?? key,
          // No password: this account signs in with Google only.
          password: '',
          emailVerified: true,
          mustConfirmEmail: false,
        });
      return signInOf(account);
    },
  },
  {
    method: 'POST',
    path: '/sign-up/email',
    handle: (ctx) => {
      const { name, email, password } = fieldsOf(ctx);
      const key = email.trim().toLowerCase();

      // The store checks its own rules before better-auth sees the request.
      const broken = brokenRule(password);
      if (broken) return answer(400, { code: 'PASSWORD_POLICY', message: broken });
      const wait = spend('/sign-up/email');
      if (wait) return tooManyRequests(wait);
      if (!name.trim()) {
        return answer(400, { code: 'VALIDATION_ERROR', message: '[body.name] Invalid input' });
      }
      if (!isEmail(key)) return answer(400, { code: 'INVALID_EMAIL', message: 'Invalid email' });
      if (password.length > MAX_PASSWORD_LENGTH) {
        return answer(400, { code: 'PASSWORD_TOO_LONG', message: 'Password too long' });
      }
      if (accounts.has(key)) {
        return answer(422, {
          code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
          message: 'User already exists. Use another email.',
        });
      }

      const account = addAccount({
        email: key,
        name: name.trim(),
        password,
        emailVerified: false,
        mustConfirmEmail: settings.emailVerificationRequired,
      });
      if (settings.emailVerificationRequired) outbox.push({ kind: 'verification', to: key });

      // As the store does, a session opens with the account even when the
      // email has to be confirmed first; the store refuses it everywhere else.
      const token = openSession(account);
      return answer(200, { token, user: authUser(account) }, { cookies: [sessionCookie(token)] });
    },
  },
  {
    method: 'GET',
    path: '/get-session',
    handle: ({ user, headers }) => {
      // An unconfirmed session is known here and nowhere else.
      const held = unconfirmedSessions.get(
        cookieOf(headers, SESSION_COOKIE) ?? onTheWeb(state.browserSession) ?? ''
      );
      const who = held ?? user;
      if (!who) return answer(200, null);
      const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
      return answer(200, {
        session: { id: `session_${who.id}`, userId: who.id, expiresAt, token: 'mock' },
        user: authUser(accounts.get(who.email.toLowerCase()) ?? who),
      });
    },
  },
  {
    method: 'POST',
    path: '/sign-out',
    handle: ({ headers }) => {
      // This phone's session only: the shopper stays signed in elsewhere.
      const token = cookieOf(headers, SESSION_COOKIE) ?? onTheWeb(state.browserSession);
      if (token) {
        state.sessions.delete(token);
        unconfirmedSessions.delete(token);
      }
      state.browserSession = null;
      return answer(
        200,
        { success: true },
        { cookies: [expired(SESSION_COOKIE), expired(SESSION_DATA_COOKIE)] }
      );
    },
  },
  verifyCodeRoute('totp'),
  verifyCodeRoute('backupCode'),
  {
    method: 'POST',
    path: '/send-verification-email',
    handle: (ctx) => {
      const wait = spend('/send-verification-email');
      if (wait) return tooManyRequests(wait);
      const key = fieldsOf(ctx).email.trim().toLowerCase();
      if (!isEmail(key)) {
        return answer(400, { code: 'VALIDATION_ERROR', message: '[body.email] Invalid email' });
      }

      const account = accounts.get(key);
      if (account && !account.emailVerified) outbox.push({ kind: 'verification', to: key });
      // The same answer whatever the address, so as not to tell who has an account.
      return answer(200, { status: true });
    },
  },
  {
    // The store's own route, not better-auth's: its own body, limit and errors.
    method: 'POST',
    path: '/forgot-password',
    handle: (ctx) => {
      const key = fieldsOf(ctx).email.trim().toLowerCase();
      if (!isEmail(key)) {
        return answer(400, { success: false, message: 'Invalid email address' });
      }
      const wait = spend('/forgot-password', key);
      if (wait) {
        return answer(
          429,
          {
            success: false,
            message: `Too many requests. Wait ${Math.ceil(wait / 60)} minutes, then try again.`,
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: wait,
          },
          { headers: { 'Retry-After': String(wait) } }
        );
      }

      if (accounts.has(key)) outbox.push({ kind: 'passwordReset', to: key });
      return answer(200, {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    },
  },
];

/** The second step of a two-step sign-in, with the authenticator's code or a backup code. */
function verifyCodeRoute(kind: 'totp' | 'backupCode'): MockAuthRoute {
  const path = kind === 'totp' ? '/two-factor/verify-totp' : '/two-factor/verify-backup-code';
  const wrongCode =
    kind === 'totp'
      ? { code: 'INVALID_CODE', message: 'Invalid code' }
      : { code: 'INVALID_BACKUP_CODE', message: 'Invalid backup code' };

  return {
    method: 'POST',
    path,
    handle: (ctx) => {
      const wait = spend(path);
      if (wait) return tooManyRequests(wait);

      const id = cookieOf(ctx.headers, TWO_FACTOR_COOKIE) ?? onTheWeb(browserChallenge);
      const challenge = id ? challenges.get(id) : undefined;
      // No sign-in waiting for a code, or its ten minutes are over.
      if (!id || !challenge || challenge.expiresAt <= Date.now()) {
        return answer(401, {
          code: 'INVALID_TWO_FACTOR_COOKIE',
          message: 'Invalid two factor cookie',
        });
      }
      const account = accounts.get(challenge.email);
      const twoFactor = account?.twoFactor;
      if (!account || !twoFactor) {
        return answer(400, { code: 'TWO_FACTOR_NOT_ENABLED', message: "Two factor isn't enabled" });
      }
      if (twoFactor.lockedUntil > Date.now()) {
        return answer(429, {
          code: 'ACCOUNT_TEMPORARILY_LOCKED',
          message:
            'Too many failed verification attempts. Your account is temporarily locked. Please try again later.',
        });
      }
      // Five wrong codes and this sign-in is gone: the next try starts from the password.
      if (challenge.attempts >= TWO_FACTOR.attemptsPerChallenge) {
        challenges.delete(id);
        return answer(
          400,
          {
            code: 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
            message: 'Too many attempts. Please request a new code.',
          },
          { cookies: [expired(TWO_FACTOR_COOKIE)] }
        );
      }

      const code = fieldsOf(ctx).code;
      const right =
        kind === 'totp' ? code === twoFactor.totpCode : twoFactor.backupCodes.delete(code);
      if (!right) {
        challenge.attempts += 1;
        twoFactor.failures += 1;
        if (twoFactor.failures >= TWO_FACTOR.maxFailures) {
          twoFactor.lockedUntil = Date.now() + TWO_FACTOR.lockSeconds * 1000;
        }
        return answer(401, wrongCode);
      }

      twoFactor.failures = 0;
      challenges.delete(id);
      browserChallenge = null;
      const token = openSession(account);
      return answer(
        200,
        { token, user: authUser(account) },
        { cookies: [sessionCookie(token), expired(TWO_FACTOR_COOKIE)] }
      );
    },
  };
}

// ─── Accounts and sessions ───────────────────────────────────────────────────

/**
 * The answer to a sign-in the store accepted: the session, or for an account
 * with two-step verification the challenge. No session yet then: a
 * short-lived cookie stands for the sign-in until the code arrives, and any
 * session cookie the phone holds is cleared.
 */
function signInOf(account: Account): Response {
  if (account.twoFactor) {
    const id = `2fa-${state.nextId++}`;
    challenges.set(id, {
      email: account.email,
      attempts: 0,
      expiresAt: Date.now() + TWO_FACTOR.challengeSeconds * 1000,
    });
    browserChallenge = id;
    return answer(
      200,
      { twoFactorRedirect: true, twoFactorMethods: ['totp'] },
      {
        cookies: [
          expired(SESSION_COOKIE),
          expired(SESSION_DATA_COOKIE),
          `${TWO_FACTOR_COOKIE}=${id}; Max-Age=${TWO_FACTOR.challengeSeconds}; Path=/; HttpOnly`,
        ],
      }
    );
  }

  const token = openSession(account);
  return answer(
    200,
    { redirect: false, token, user: authUser(account) },
    { cookies: [sessionCookie(token)] }
  );
}

function addAccount(account: MockAccount): Account {
  const email = account.email.toLowerCase();
  // The id is made from the address as it always was, so carts and wishlists
  // kept by id stay where tests expect them.
  const id = `user_${email.split('@')[0] ?? email}`;
  const stored: Account = {
    ...account,
    id,
    email,
    twoFactor: account.twoFactor && {
      totpCode: account.twoFactor.totpCode,
      backupCodes: new Set(account.twoFactor.backupCodes),
      failures: 0,
      lockedUntil: 0,
    },
  };
  accounts.set(email, stored);
  return stored;
}

/** The account the email and password open, or `null`. An address the store has never seen is made with the mock's password. */
function accountSigningIn(email: string, password: string): Account | null {
  const known = accounts.get(email);
  if (known) return known.password === password ? known : null;
  if (password !== MOCK_PASSWORD) return null;
  return addAccount({
    email,
    name: email.split('@')[0] ?? email,
    password,
    emailVerified: true,
    mustConfirmEmail: false,
  });
}

function openSession(account: Account): string {
  const token = `mock-session-${state.nextId++}`;
  if (account.mustConfirmEmail && !account.emailVerified) unconfirmedSessions.set(token, account);
  else state.sessions.set(token, { id: account.id, name: account.name, email: account.email });
  state.browserSession = token;
  return token;
}

/** The user as better-auth sends it, with the store's own field for two-step verification. */
function authUser(user: MockUser | Account) {
  const now = new Date().toISOString();
  const account = 'password' in user ? user : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: account?.emailVerified ?? true,
    image: null,
    twoFactorEnabled: Boolean(account?.twoFactor),
    createdAt: now,
    updatedAt: now,
  };
}

// ─── The store's defences ────────────────────────────────────────────────────

/** Seconds left on the email's lock, or 0. */
function lockedFor(email: string): number {
  const lockedUntil = failedSignIns.get(email)?.lockedUntil ?? 0;
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

/** Counts one wrong password. Warns over the last few attempts; locks on the last. */
function recordFailedSignIn(email: string): { locked: boolean; attemptsRemaining: number | null } {
  const record = failedSignIns.get(email) ?? { attempts: 0, lockedUntil: 0 };
  record.attempts += 1;
  failedSignIns.set(email, record);

  if (record.attempts >= LOCKOUT.maxAttempts) {
    // The count starts again with the lock, so the email recovers when it lifts.
    record.attempts = 0;
    record.lockedUntil = Date.now() + LOCKOUT.seconds * 1000;
    return { locked: true, attemptsRemaining: 0 };
  }
  const remaining = LOCKOUT.maxAttempts - record.attempts;
  return { locked: false, attemptsRemaining: remaining <= LOCKOUT.warnAt ? remaining : null };
}

/** The store's answer to a locked email: the wait in the body, for the app to word, and in the header. */
function lockedOut(seconds: number): Response {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return answer(
    429,
    {
      code: 'ACCOUNT_LOCKED',
      message: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      retryAfterSeconds: seconds,
    },
    { headers: { 'Retry-After': String(seconds), 'cache-control': 'no-store' } }
  );
}

/**
 * Counts a request against its endpoint's limit. Returns the seconds to wait
 * when the limit is spent, else 0.
 */
function spend(rule: string, key = ''): number {
  const limit = RATE_LIMITS[rule];
  if (!limit) return 0;
  const now = Date.now();
  const windowMs = limit.windowSeconds * 1000;
  const id = `${rule}|${key}`;
  const recent = (requestTimes.get(id) ?? []).filter((at) => now - at < windowMs);

  if (recent.length >= limit.max) {
    requestTimes.set(id, recent);
    return Math.max(1, Math.ceil(((recent[0] ?? now) + windowMs - now) / 1000));
  }
  recent.push(now);
  requestTimes.set(id, recent);
  return 0;
}

/** better-auth's own limit: a bare 429, no code, the wait only in a header. */
function tooManyRequests(seconds: number): Response {
  return answer(
    429,
    { message: 'Too many requests. Please try again later.' },
    { headers: { 'X-Retry-After': String(seconds) } }
  );
}

/** The store's password rules, worded as the store words a refusal; `null` when the password keeps them. */
function brokenRule(password: string): string | null {
  const policy = settings.passwordPolicy;
  if (!password) return 'Password is required.';
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters.`;
  }
  if (password.length > policy.maxLength) {
    return `Password must be at most ${policy.maxLength} characters.`;
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (policy.requireSpecialCharacter && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character.';
  }
  return null;
}

// ─── Requests and responses ──────────────────────────────────────────────────

/** The body's text fields, as empty strings when they are missing. */
function fieldsOf(ctx: MockAuthContext): Record<'name' | 'email' | 'password' | 'code', string> {
  const body = (typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : '');
  return {
    name: text('name'),
    email: text('email'),
    password: text('password'),
    code: text('code'),
  };
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cookieOf(headers: Headers, name: string): string | null {
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name && value.length) return value.join('=') || null;
  }
  return null;
}

/** What only a browser's own cookie jar would know, which the mock keeps for it. */
function onTheWeb(value: string | null): string | null {
  return Platform.OS === 'web' ? value : null;
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly`;
}

function expired(name: string): string {
  return `${name}=; Max-Age=0; Path=/`;
}

/** A response with a JSON body as it is, and any number of cookies. */
function answer(
  status: number,
  body: unknown,
  { cookies = [], headers = {} }: { cookies?: string[]; headers?: Record<string, string> } = {}
): Response {
  const all = new Headers({ 'content-type': 'application/json', ...headers });
  for (const cookie of cookies) all.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers: all });
}
