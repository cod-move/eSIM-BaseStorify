/**
 * Turns a refused auth request into a sentence the shopper can act on.
 *
 * The auth server answers in English and with facts: a `code`, and for a
 * lockout how long it lasts and how many attempts are left. The sentence is
 * built here, in the shopper's language, from those facts. This mirrors the
 * store's web app, so both say the same thing.
 *
 * The sentences live in two places, so there are two functions. A caller tries
 * `describeAuthError` (wrong password, lockout, rate limit: the sentences that
 * carry a fact, under `auth.errors`), then `describeAuthRefusal` (the fixed
 * ones, under `errors`), then says something general. It never falls back to
 * "wrong email or password": that is true of INVALID_EMAIL_OR_PASSWORD only.
 */

export type AuthErrorPayload = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  retryAfterSeconds?: number | null;
  attemptsRemaining?: number | null;
};

/** The translator of the `auth.errors` messages, reduced to what this module needs. */
type Translate = (key: AuthErrorKey, values?: Record<string, string | number>) => string;

type AuthErrorKey =
  | 'invalidCredentials'
  | 'invalidCredentialsWithAttempts'
  | 'accountLocked'
  | 'accountLockedUnknown'
  | 'durationMinutes'
  | 'durationSeconds'
  | 'tooManyRequests'
  | 'tooManyRequestsWait'
  | 'invalidEmail'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'invalidCode'
  | 'invalidBackupCode'
  | 'codeAttemptsUsedUp'
  | 'twoFactorExpired'
  | 'twoFactorLocked'
  | 'signInNotConfirmed'
  | 'googleUnavailable'
  | 'googleNotLinked'
  | 'googleShoppersOnly'
  | 'googleFailed'
  | 'googleNoAccount';

/** The field a refusal is about, so a form can show it there. */
export type AuthField = 'name' | 'email' | 'password' | 'code';

/**
 * Codes that need no fact to be worded. They come from better-auth itself
 * (`INVALID_EMAIL`, the two-factor plugin's), not from the store's hooks
 * around it, whose codes `describeAuthRefusal` words.
 */
const PLAIN: Readonly<Record<string, AuthErrorKey>> = {
  INVALID_EMAIL: 'invalidEmail',
  PASSWORD_TOO_SHORT: 'passwordTooShort',
  PASSWORD_TOO_LONG: 'passwordTooLong',
  INVALID_CODE: 'invalidCode',
  INVALID_BACKUP_CODE: 'invalidBackupCode',
  // Five wrong codes for one sign-in: the server forgets it, and the shopper
  // starts again from the password.
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'codeAttemptsUsedUp',
  // The ten minutes between the password and the code ran out.
  INVALID_TWO_FACTOR_COOKIE: 'twoFactorExpired',
  // Ten wrong codes across sign-ins lock the account's second step. The server
  // says no more than that, so no time is promised.
  ACCOUNT_TEMPORARILY_LOCKED: 'twoFactorLocked',
  // "Continue with Google": the store did not accept the token Google gave the
  // phone (too old, not for this store), or could not read an email from it.
  INVALID_TOKEN: 'signInNotConfirmed',
  USER_EMAIL_NOT_FOUND: 'signInNotConfirmed',
  FAILED_TO_GET_USER_INFO: 'signInNotConfirmed',
  // The store has switched Google sign-in off since the app last read its settings.
  PROVIDER_NOT_FOUND: 'googleUnavailable',
  ID_TOKEN_NOT_SUPPORTED: 'googleUnavailable',
  // The store's session hook: Google signs in shoppers only, never a vendor or staff account.
  OAUTH_ACCOUNT_ROLE_CONFLICT: 'googleShoppersOnly',
  OAUTH_SIGNIN_IS_ONLY_AVAILABLE_FOR_CUSTOMERS: 'googleShoppersOnly',
  // The app's own codes, for what the phone's Google SDK could not do (`useSignIn`).
  GOOGLE_SIGN_IN_FAILED: 'googleFailed',
  GOOGLE_NO_ACCOUNT: 'googleNoAccount',
};

/**
 * better-auth's answer when Google names an email that already has an account
 * it will not join to Google: one whose email was never confirmed (the
 * store's linking rules). Its other `OAUTH_LINK_ERROR`s are failures to save,
 * which get the general sentence.
 */
const NOT_LINKED = 'account not linked';

const FIELDS: Readonly<Record<string, AuthField>> = {
  INVALID_EMAIL: 'email',
  USER_ALREADY_EXISTS: 'email',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'email',
  PASSWORD_TOO_SHORT: 'password',
  PASSWORD_TOO_LONG: 'password',
  PASSWORD_POLICY: 'password',
  INVALID_CODE: 'code',
  INVALID_BACKUP_CODE: 'code',
};

/** The translator of the `errors` messages, reduced to what this module needs. */
type TranslateRefusal = (key: AuthRefusalKey) => string;

type AuthRefusalKey =
  | 'signIn.emailNotVerified'
  | 'signIn.accountInactive'
  | 'signIn.originRefused'
  | 'reason.PASSWORD_POLICY'
  | 'reason.EMAIL_TAKEN';

function toCount(value: unknown): number | null {
  const parsed = Number(value);
  if (value === null || value === undefined || !Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

/** "14 minutes" or "45 seconds": a wait under a minute is not rounded up to one. */
function describeWait(seconds: number, t: Translate): string {
  if (seconds < 60) return t('durationSeconds', { count: Math.max(1, seconds) });
  return t('durationMinutes', { count: Math.ceil(seconds / 60) });
}

/**
 * The sentences that carry a fact: how many attempts are left, how long a lock
 * lasts. Returns `null` when the error is not one of these.
 */
export function describeAuthError(payload: AuthErrorPayload, t: Translate): string | null {
  if (payload.code === 'ACCOUNT_LOCKED') {
    const seconds = toCount(payload.retryAfterSeconds);
    // No countdown from the server means no time can be promised.
    if (seconds === null || seconds === 0) return t('accountLockedUnknown');
    return t('accountLocked', { duration: describeWait(seconds, t) });
  }

  if (payload.code === 'INVALID_EMAIL_OR_PASSWORD') {
    const remaining = toCount(payload.attemptsRemaining);
    if (remaining === null || remaining === 0) return t('invalidCredentials');
    return t('invalidCredentialsWithAttempts', { count: remaining });
  }

  const plain = PLAIN[payload.code ?? ''];
  if (plain) return t(plain);

  if (payload.code === 'OAUTH_LINK_ERROR') {
    return payload.message?.trim().toLowerCase() === NOT_LINKED ? t('googleNotLinked') : null;
  }

  // The auth server's own per-device limit has no code: it is a bare 429 with
  // the wait in a header. The store's own routes add `RATE_LIMIT_EXCEEDED`.
  if (payload.status === 429) {
    const seconds = toCount(payload.retryAfterSeconds);
    if (seconds === null || seconds === 0) return t('tooManyRequests');
    return t('tooManyRequestsWait', { duration: describeWait(seconds, t) });
  }

  return null;
}

/** The key of the fixed sentence of a refusal, by the `code` the auth server sends. */
function refusalKey(code: string | null | undefined): AuthRefusalKey | null {
  switch (code) {
    case 'EMAIL_NOT_VERIFIED':
      return 'signIn.emailNotVerified';
    case 'ACCOUNT_INACTIVE_OR_BANNED':
      return 'signIn.accountInactive';
    // The scheme is not the one the store trusts, or the store's API is off.
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return 'signIn.originRefused';
    // Sign-up. Both say what the API's `reason` of the same name says.
    case 'PASSWORD_POLICY':
      return 'reason.PASSWORD_POLICY';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'reason.EMAIL_TAKEN';
    default:
      return null;
  }
}

/**
 * The fixed sentences: the email is not verified, the account is closed, the
 * store does not accept this app, and at sign-up a password that breaks the
 * store's rules or an email already in use. Returns `null` when the error is
 * not one of these.
 */
export function describeAuthRefusal(payload: AuthErrorPayload, t: TranslateRefusal): string | null {
  const key = refusalKey(payload.code);
  return key === null ? null : t(key);
}

/** The field the refusal is about, or `null` when it concerns the whole form. */
export function authErrorField(payload: AuthErrorPayload): AuthField | null {
  return FIELDS[payload.code ?? ''] ?? null;
}
