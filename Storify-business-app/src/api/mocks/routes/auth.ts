/**
 * The store's auth server, `/api/auth/*`, answering as the real one does:
 * better-auth's endpoints and shapes, with what the store adds around them:
 * only operators sign in from the business app (a shopper is refused before
 * any session exists), its lockout, its password rules, its rate limits.
 * That shape is not the business API's envelope, so each route returns its
 * whole response.
 *
 * The accounts are in `fixtures/accounts.ts`.
 */
import { Platform } from 'react-native';

import { ACCOUNTS, type MockAccount } from '../fixtures/accounts';
import { config } from '../fixtures/config';
import { SESSION_COOKIE, type MockAuthContext, type MockAuthRoute } from '../kit';
import { state } from '../state';

/** The cookie that carries a two-step sign-in from the password to the code. */
const TWO_FACTOR_COOKIE = 'better-auth.two_factor';
/** The session's cached copy, which the real server sets beside the token. */
const SESSION_DATA_COOKIE = 'better-auth.session_data';
const SESSION_SECONDS = 30 * 24 * 60 * 60;

/** The store's lockout (its admin's "max login attempts" and "lockout duration"). */
export const LOCKOUT = { maxAttempts: 5, warnAt: 3, seconds: 15 * 60 };

/** Two-step sign-in: how long the code may take, and how many wrong codes it takes. */
const TWO_FACTOR = { challengeSeconds: 10 * 60, attemptsPerChallenge: 5 };

/** Requests allowed per window, per endpoint, from one phone: the store's `rateLimit.customRules`. */
const RATE_LIMITS: Readonly<Record<string, { windowSeconds: number; max: number }>> = {
  '/sign-in/email': { windowSeconds: 60, max: 8 },
  '/two-factor/verify-totp': { windowSeconds: 300, max: 6 },
  '/two-factor/verify-backup-code': { windowSeconds: 900, max: 5 },
  '/change-password': { windowSeconds: 900, max: 5 },
  // The store's own route, counted per address (`rateLimitPresets.strict`).
  '/forgot-password': { windowSeconds: 900, max: 5 },
};

/** A sign-in waiting for its second step. */
type Challenge = { account: MockAccount; attempts: number; expiresAt: number };

// What the auth server remembers. `reset` forgets it and seeds the accounts.
const accounts = new Map<string, MockAccount>();
const failedSignIns = new Map<string, { attempts: number; lockedUntil: number }>();
const requestTimes = new Map<string, number[]>();
const challenges = new Map<string, Challenge>();
/** Two-step verification turned on and waiting for its first code, by account. */
const pendingSetups = new Map<string, { totpCode: string; backupCodes: string[] }>();
/** A browser keeps the two-step cookie itself and hides it from scripts: this stands in for it. */
let browserChallenge: string | null = null;
/** The addresses the store has emailed a reset link to since the last reset. */
const resetLinks: string[] = [];

/** For tests: who the store has emailed a reset link to, oldest first. */
export function sentResetLinks(): string[] {
  return [...resetLinks];
}

export function reset(): void {
  accounts.clear();
  for (const account of ACCOUNTS) {
    // A copy: changing a password or two-step verification lasts until the next reset.
    accounts.set(account.email, {
      ...account,
      twoFactor: account.twoFactor && {
        ...account.twoFactor,
        backupCodes: [...account.twoFactor.backupCodes],
      },
    });
  }
  failedSignIns.clear();
  requestTimes.clear();
  challenges.clear();
  pendingSetups.clear();
  browserChallenge = null;
  resetLinks.length = 0;
}
reset();

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

      const account = accounts.get(key);
      if (!account || account.password !== password) {
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
      failedSignIns.delete(key);

      // The store's session hook: a shopper's account never gets a business-app
      // session, so the app never holds one it cannot use.
      if (account.role === 'customer') {
        return answer(403, {
          code: 'BIZ_APP_OPERATORS_ONLY',
          message: 'This app is for the people who run the store.',
        });
      }

      if (account.twoFactor) {
        // No session yet: a short-lived cookie stands for the sign-in until the
        // code arrives, and any session cookie the phone holds is cleared.
        const id = `2fa-${state.nextId++}`;
        challenges.set(id, {
          account,
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
    },
  },
  {
    method: 'GET',
    path: '/get-session',
    handle: ({ account }) => {
      if (!account) return answer(200, null);
      const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
      return answer(200, {
        session: { id: `session_${account.id}`, userId: account.id, expiresAt, token: 'mock' },
        user: authUser(account),
      });
    },
  },
  {
    method: 'POST',
    path: '/sign-out',
    handle: ({ headers }) => {
      // This phone's session only: the operator stays signed in elsewhere.
      const token = cookieOf(headers, SESSION_COOKIE) ?? onTheWeb(state.browserSession);
      if (token) state.sessions.delete(token);
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
    // Turning two-step verification on, step one: the password again, then
    // the authenticator's link and the backup codes. It is on once a first
    // code from the authenticator is sent to verify-totp.
    method: 'POST',
    path: '/two-factor/enable',
    handle: (ctx) => {
      const account = ctx.account;
      if (!account) return unauthorized();
      if (fieldsOf(ctx).password !== account.password) return invalidPassword();
      const setup = { totpCode: '654321', backupCodes: ['KLMNO-11111', 'PQRST-22222'] };
      pendingSetups.set(account.id, setup);
      return answer(200, {
        totpURI: `otpauth://totp/Storify:${encodeURIComponent(account.email)}?secret=MOCKSECRET&issuer=Storify`,
        backupCodes: setup.backupCodes,
      });
    },
  },
  {
    method: 'POST',
    path: '/two-factor/disable',
    handle: (ctx) => {
      const account = ctx.account;
      if (!account) return unauthorized();
      if (fieldsOf(ctx).password !== account.password) return invalidPassword();
      account.twoFactor = undefined;
      pendingSetups.delete(account.id);
      return answer(200, { status: true });
    },
  },
  {
    method: 'POST',
    path: '/change-password',
    handle: (ctx) => {
      const account = ctx.account;
      if (!account) return unauthorized();
      const wait = spend('/change-password');
      if (wait) return tooManyRequests(wait);

      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const next = typeof body.newPassword === 'string' ? body.newPassword : '';
      // The store checks its own rules before better-auth sees the request.
      const broken = brokenRule(next);
      if (broken) return answer(400, { code: 'PASSWORD_POLICY', message: broken });
      if (current !== account.password) return invalidPassword();

      account.password = next;
      if (body.revokeOtherSessions === true) {
        // Every other device of this account is signed out; this one stays.
        const keep = cookieOf(ctx.headers, SESSION_COOKIE) ?? onTheWeb(state.browserSession);
        for (const [token, held] of state.sessions) {
          if (held === account && token !== keep) state.sessions.delete(token);
        }
      }
      return answer(200, { token: null, user: authUser(account) });
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

      // The same answer whatever the address, so as not to tell who has an account.
      if (accounts.has(key)) resetLinks.push(key);
      return answer(200, {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    },
  },
];

/**
 * The code step: the second step of a two-step sign-in (with the cookie that
 * carries it), or, signed in, the first code after turning two-step on.
 */
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
      const code = fieldsOf(ctx).code.replace(/\s/g, '');

      // Signed in already: confirming two-step verification just turned on.
      const setup = ctx.account ? pendingSetups.get(ctx.account.id) : undefined;
      if (ctx.account && setup && kind === 'totp') {
        if (code !== setup.totpCode) return answer(401, wrongCode);
        ctx.account.twoFactor = setup;
        pendingSetups.delete(ctx.account.id);
        return answer(200, { token: 'mock', user: authUser(ctx.account) });
      }

      const id = cookieOf(ctx.headers, TWO_FACTOR_COOKIE) ?? onTheWeb(browserChallenge);
      const challenge = id ? challenges.get(id) : undefined;
      // No sign-in waiting for a code, or its ten minutes are over.
      if (!id || !challenge || challenge.expiresAt <= Date.now()) {
        return answer(401, {
          code: 'INVALID_TWO_FACTOR_COOKIE',
          message: 'Invalid two factor cookie',
        });
      }
      const { account } = challenge;
      const twoFactor = account.twoFactor;
      if (!twoFactor) {
        return answer(400, { code: 'TWO_FACTOR_NOT_ENABLED', message: "Two factor isn't enabled" });
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

      const backupIndex = twoFactor.backupCodes.indexOf(code);
      const right = kind === 'totp' ? code === twoFactor.totpCode : backupIndex >= 0;
      if (!right) {
        challenge.attempts += 1;
        return answer(401, wrongCode);
      }
      // Each backup code works once.
      if (kind === 'backupCode') twoFactor.backupCodes.splice(backupIndex, 1);

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

// ─── Sessions ────────────────────────────────────────────────────────────────

function openSession(account: MockAccount): string {
  const token = `mock-session-${state.nextId++}`;
  state.sessions.set(token, account);
  state.browserSession = token;
  return token;
}

/** The user as better-auth sends it, with the store's own field for two-step verification. */
function authUser(account: MockAccount) {
  const now = new Date().toISOString();
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    emailVerified: true,
    image: account.imageUrl ?? null,
    role: account.role,
    twoFactorEnabled: Boolean(account.twoFactor),
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
 * Counts a request against its endpoint's limit, for one phone or, with `key`,
 * for one address. Returns the seconds to wait when it is spent, else 0.
 */
function spend(rule: string, key = ''): number {
  const limit = RATE_LIMITS[rule];
  if (!limit) return 0;
  const bucket = key ? `${rule}:${key}` : rule;
  const now = Date.now();
  const windowMs = limit.windowSeconds * 1000;
  const recent = (requestTimes.get(bucket) ?? []).filter((at) => now - at < windowMs);

  if (recent.length >= limit.max) {
    requestTimes.set(bucket, recent);
    return Math.max(1, Math.ceil(((recent[0] ?? now) + windowMs - now) / 1000));
  }
  recent.push(now);
  requestTimes.set(bucket, recent);
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

/** The store's password rules (`GET /config`'s), worded as the store words a refusal; `null` when kept. */
function brokenRule(password: string): string | null {
  const policy = config('en').auth.passwordPolicy;
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

function unauthorized(): Response {
  return answer(401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
}

function invalidPassword(): Response {
  return answer(400, { code: 'INVALID_PASSWORD', message: 'Invalid password' });
}

// ─── Requests and responses ──────────────────────────────────────────────────

/** The body's text fields, as empty strings when they are missing. */
function fieldsOf(ctx: MockAuthContext): Record<'email' | 'password' | 'code', string> {
  const body = (typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : '');
  return { email: text('email'), password: text('password'), code: text('code') };
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
