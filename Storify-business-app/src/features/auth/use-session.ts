import { authClient } from '@/lib/auth-client';

/**
 * Who is signed in. The last session is remembered on the device, so this
 * answers on the first frame; the server is asked again behind it.
 *
 * Only an operator ever holds a session here: the store refuses a shopper's
 * sign-in from the business app before any session exists
 * (`BIZ_APP_OPERATORS_ONLY`). What they may do is GET /me's to say
 * (`features/workspace`).
 *
 * `sessionId` changes while the person stays: a password changed with "sign
 * out other devices" ends this session too, and the store hands the phone a
 * new one. What the store keeps per session (this phone's push registration)
 * has to follow it.
 */
export function useSession() {
  const { data, isPending } = authClient.useSession();
  const user = data?.user ?? null;
  const sessionId = data?.session.id ?? null;

  return { user, sessionId, isSignedIn: Boolean(user), isPending };
}
