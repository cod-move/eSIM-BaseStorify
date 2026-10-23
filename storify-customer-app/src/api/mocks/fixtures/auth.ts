/**
 * The mock store's accounts, and the settings and limits of its auth server.
 *
 * Sign in with:
 *
 * - **any other email** and the password `password`. The account is made on the
 *   spot, as the mock always did.
 * - **`two-step@example.com`**, password `password`: two-step verification is
 *   on. The authenticator code is always `123456`. The backup codes are
 *   `ABCDE-12345` and `FGHIJ-67890`, each good once.
 * - **`unverified@example.com`**, password `password`: the store wants this
 *   email confirmed first, and refuses to sign it in until it is ("check your
 *   email"). The mock has no inbox to click a link in, so it stays that way.
 *
 * And the store's defences, as the real one has them:
 *
 * - **Lockout:** five wrong passwords in a row for one email lock it for 15
 *   minutes. The last three warn how many tries are left.
 * - **Rate limits:** more than eight sign-ins a minute from the phone are
 *   refused with a wait, whatever the email (better-auth's own limit). Each
 *   other endpoint has its limit below.
 */
import type { PasswordPolicy } from '@/contracts/mobile/shop/v1';

import { config } from './config';

/**
 * An ID token as the mock store takes one from "Continue with Google": the
 * real store checks Google's signature, the mock only reads the email. The
 * mock's `GET /config` sends no Google client, so the button shows only where
 * a test gives the settings one.
 */
export function mockGoogleIdToken(email: string): string {
  return `mock-google:${email}`;
}

/** Every account's password, unless the account was created with another. */
export const MOCK_PASSWORD = 'password';

/** The code `two-step@example.com`'s authenticator app always shows. */
export const MOCK_TOTP_CODE = '123456';

export type MockAccount = {
  email: string;
  name: string;
  password: string;
  emailVerified: boolean;
  /** The store refuses to sign the account in until its email is confirmed (`blocked_pending`). */
  mustConfirmEmail: boolean;
  twoFactor?: { totpCode: string; backupCodes: readonly string[] };
};

export const ACCOUNTS: readonly MockAccount[] = [
  {
    email: 'two-step@example.com',
    name: 'Tahmid Rahman',
    password: MOCK_PASSWORD,
    emailVerified: true,
    mustConfirmEmail: false,
    twoFactor: { totpCode: MOCK_TOTP_CODE, backupCodes: ['ABCDE-12345', 'FGHIJ-67890'] },
  },
  {
    email: 'unverified@example.com',
    name: 'Una Verity',
    password: MOCK_PASSWORD,
    emailVerified: false,
    mustConfirmEmail: true,
  },
];

/**
 * Signing in and creating an account, as the store has them set. The password
 * rules are the ones `GET /config` sends as `auth.passwordPolicy`, so the app
 * checks what the auth routes enforce. Whether a new account must confirm its
 * email is not in `GET /config`: the app learns it from the store's answers.
 */
export type MockAuthSettings = {
  passwordPolicy: PasswordPolicy;
  emailVerificationRequired: boolean;
  /**
   * "Continue with Google": the web client ID `GET /config` sends while it is
   * on. Off in the mock, which has no Google client for the phone's SDK to
   * use; a test switches it on.
   */
  googleWebClientId: string | null;
};

export const AUTH_SETTINGS: MockAuthSettings = {
  passwordPolicy: config('en').auth.passwordPolicy,
  emailVerificationRequired: false,
  googleWebClientId: null,
};

/** The store's lockout (its admin's "max login attempts" and "lockout duration"). */
export const LOCKOUT = {
  maxAttempts: 5,
  /** Attempts left at or under which a wrong password says how many remain. */
  warnAt: 3,
  seconds: 15 * 60,
};

/** Two-step sign-in: how long the code may take, and how many wrong codes it takes. */
export const TWO_FACTOR = {
  challengeSeconds: 10 * 60,
  attemptsPerChallenge: 5,
  /** Wrong codes in a row, across sign-ins, that lock the account's second step. */
  maxFailures: 10,
  lockSeconds: 15 * 60,
};

/** Requests allowed per window, per endpoint, from one phone: the store's `rateLimit.customRules`. */
export const RATE_LIMITS: Readonly<Record<string, { windowSeconds: number; max: number }>> = {
  '/sign-in/email': { windowSeconds: 60, max: 8 },
  '/sign-in/social': { windowSeconds: 60, max: 8 },
  '/sign-up/email': { windowSeconds: 300, max: 5 },
  '/send-verification-email': { windowSeconds: 900, max: 5 },
  '/two-factor/verify-totp': { windowSeconds: 300, max: 6 },
  '/two-factor/verify-backup-code': { windowSeconds: 900, max: 5 },
  // The store's own route, limited per address rather than per phone.
  '/forgot-password': { windowSeconds: 900, max: 5 },
};
