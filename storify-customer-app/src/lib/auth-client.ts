import { expoClient } from '@better-auth/expo/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { transport } from '@/api/transport';
import { env } from '@/config/env';

import { secureStorage } from './secure-storage';
import { SECURE_KEYS } from './storage-keys';

/**
 * Sign-in, sign-up and sign-out, two-step verification and the session,
 * through the store's own `/api/auth/*`. Nothing about accounts goes through
 * the mobile API: the store's lockout, password policy and rate limits live on
 * these endpoints, and a wrapper around them would skip all three.
 *
 * The Expo plugin keeps the session cookie in encrypted storage instead of the
 * platform's cookie jar, tells the server which app is calling (the app's
 * scheme, from the app config), and remembers the last session so the app
 * opens signed in without waiting for the network. It also keeps the short-
 * lived cookie that carries a two-step sign-in from the password to the code.
 *
 * The two-factor plugin adds the code endpoints (`twoFactor.verifyTotp`,
 * `twoFactor.verifyBackupCode`). It is given no redirect: the sign-in hook
 * reads `twoFactorRedirect` from the answer and moves to the code step itself.
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
    customFetchImpl: transport,
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
 * chosen on the store's website, where the link leads.
 */
export function requestPasswordReset(email: string, fetchOptions?: AuthFetchOptions) {
  return authClient.$fetch<{ success: boolean; message?: string }>('/forgot-password', {
    method: 'POST',
    body: { email },
    ...fetchOptions,
  });
}

/**
 * The cookie to send with a request to the mobile API. Empty when nobody is
 * signed in. In a browser the cookie is the browser's own business.
 */
export function getSessionCookie(): string {
  return authClient.getCookie();
}

/**
 * Asks the store again who is signed in, after the mobile API refused the
 * session cookies in `refused`. Resolves whether the session was renewed: the
 * store holds one, and the phone now carries a cookie the API has not refused.
 *
 * A session that is not renewed is signed out of: the store has dropped it, or
 * the API refuses the very cookie the store confirms. Two answers leave it be:
 * a session whose email still waits for its link (the API refuses that one by
 * design until the link is followed), and no answer at all (the session may
 * well be fine; the refused request fails as it is).
 */
export async function refreshSession(refused: ReadonlySet<string>): Promise<boolean> {
  let answer: Awaited<ReturnType<typeof authClient.getSession>>;
  try {
    answer = await authClient.getSession({ query: { disableCookieCache: true } });
  } catch {
    return false;
  }
  if (answer.error) return false;

  const held = answer.data;
  const cookie = getSessionCookie();
  if (held && cookie && !refused.has(cookie)) return true;
  if (held && !held.user.emailVerified) return false;

  // Throws only with no answer at all; the phone forgets the session before the request goes out.
  await authClient.signOut().catch(() => undefined);
  return false;
}
