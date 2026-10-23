import { expoClient } from '@better-auth/expo/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { transport } from '@/api/transport';
import { env } from '@/config/env';

import { isFirstRun } from './device';
import { secureStorage } from './secure-storage';
import { SECURE_KEYS } from './storage-keys';

// On iOS the Keychain outlives the app: deleted and installed again, it would
// open signed in as whoever used it before. The first run of an install starts
// signed out, with the two keys as the Expo plugin's own sign-out leaves them.
if (isFirstRun) {
  secureStorage.setItem(`${SECURE_KEYS.authPrefix}_cookie`, '{}');
  secureStorage.setItem(`${SECURE_KEYS.authPrefix}_session_data`, '{}');
}

/** How long a call to the auth server may go without an answer before it fails. */
const AUTH_TIMEOUT_MS = 15_000;

/**
 * The transport, with a time limit: a call to the auth server that gets no
 * answer (a connection that hangs) fails as one with no connection does,
 * instead of leaving sign-in, sign-out or the session check waiting for good.
 *
 * better-fetch has a `timeout` option, but it applies only to a call made
 * without a `signal`, and the session check (`useSession`) always passes one.
 * Here the limit holds for every call, and the caller's signal still calls the
 * request off.
 */
const authFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const callOff = () => controller.abort();
  const signal = init?.signal;
  if (signal?.aborted) callOff();
  else signal?.addEventListener('abort', callOff);
  const timer = setTimeout(callOff, AUTH_TIMEOUT_MS);
  return transport(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', callOff);
  });
};

/**
 * Sign-in, two-step verification, the password, and sign-out, through the
 * store's own `/api/auth/*`. Nothing about the account goes through the
 * business API: the store's lockout, password policy and rate limits live on
 * these endpoints, and a wrapper around them would skip all three.
 *
 * The Expo plugin keeps the session cookie in encrypted storage instead of the
 * platform's cookie jar, tells the server which app is calling (the app's
 * scheme, from the app config: the store makes a session signed in from the
 * business app's scheme a business-app session, the only kind the business
 * API accepts), and remembers the last session so the app opens signed in
 * without waiting for the network. It also keeps the short-lived cookie that
 * carries a two-step sign-in from the password to the code.
 *
 * The two-factor plugin adds the code endpoints (`twoFactor.verifyTotp`,
 * `twoFactor.verifyBackupCode`) and turning two-step verification on and off
 * (`twoFactor.enable`, `twoFactor.disable`). It is given no redirect: the
 * sign-in hook reads `twoFactorRedirect` from the answer and moves to the code
 * step itself.
 *
 * `better-auth` and `@better-auth/expo` are pinned to the version the store
 * runs. Change the three together.
 */
export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  plugins: [
    expoClient({
      storage: secureStorage,
      storagePrefix: SECURE_KEYS.authPrefix,
    }),
    twoFactorClient(),
  ],
  fetchOptions: {
    customFetchImpl: authFetch,
  },
});

/** What a call to the auth server can be handed besides its body: hooks that see the raw answer. */
export type AuthFetchOptions = {
  onError?: (context: { response: Response }) => void | Promise<void>;
};

/**
 * Asks the store to email a link that sets a new password. This is the store's
 * own route beside better-auth's, rate-limited per address: it answers the
 * same whether or not the address has an account, and the new password is
 * chosen on the store's website, where the link in the email leads.
 */
export function requestPasswordReset(email: string, fetchOptions?: AuthFetchOptions) {
  return authClient.$fetch<{ success: boolean; message?: string }>('/forgot-password', {
    method: 'POST',
    body: { email },
    ...fetchOptions,
  });
}

/**
 * The cookie to send with a request to the business API. Empty when nobody is
 * signed in. In a browser the cookie is the browser's own business.
 */
export function getSessionCookie(): string {
  return authClient.getCookie();
}

let recheck: Promise<unknown> | null = null;

/**
 * Asks the server again who is signed in, after the business API refused the
 * session the app sent (a sign-out on another device, a password change, an
 * account switched off).
 *
 * The question skips the cookie cache on purpose. `/get-session` otherwise
 * answers from a signed copy of the session kept in a cookie for up to five
 * minutes, so a session the store has revoked would still look signed in. Asked
 * this way, the server answers "nobody" and expires the cookies; the Expo
 * plugin removes them from the device and `useSession()` follows. Several
 * refusals at once ask once.
 */
export function recheckSession(): Promise<unknown> {
  recheck ??= authClient.getSession({ query: { disableCookieCache: true } }).finally(() => {
    recheck = null;
  });
  return recheck;
}
