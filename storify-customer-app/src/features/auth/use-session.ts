import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/endpoints/me';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';
import { authClient } from '@/lib/auth-client';

/**
 * Whether the store accepts a session whose user has not confirmed their email.
 *
 * Which stores want the email confirmed is not in `GET /config`; it shows only
 * in what they do. They open a session at sign-up all the same, and refuse it
 * (401) everywhere but `get-session` until the link in the email is followed.
 * The same session then starts working, with nothing to sign in again. So a
 * session of an unconfirmed user is asked about once, with the shopper's own
 * profile (`GET /me`), and again whenever the app returns to the foreground:
 * the shopper has probably just been to their inbox.
 */
function useUnconfirmedProbe(unconfirmed: boolean) {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.me(locale),
    queryFn: ({ signal }) => getMe(locale, signal),
    enabled: unconfirmed,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
  });
}

/**
 * Who is signed in. The last session is remembered on the device, so this
 * answers on the first frame; the server is asked again behind it.
 *
 * A session the store refuses until its email is confirmed is not a sign-in:
 * `isSignedIn` stays false and `awaitingEmail` is the address to confirm, for
 * the "check your email" step. `isPending` holds while that is being found out.
 */
export function useSession() {
  const { data, isPending: sessionPending } = authClient.useSession();
  const sessionUser = data?.user ?? null;
  const probe = useUnconfirmedProbe(Boolean(sessionUser && !sessionUser.emailVerified));

  const unconfirmed = Boolean(sessionUser && !sessionUser.emailVerified);
  const refused = unconfirmed && isApiError(probe.error) && probe.error.status === 401;
  const accepted = !unconfirmed || probe.isSuccess;

  return {
    user: accepted ? sessionUser : null,
    isSignedIn: accepted && Boolean(sessionUser),
    isPending: sessionPending || (unconfirmed && !refused && !accepted && probe.isPending),
    awaitingEmail: refused && sessionUser ? sessionUser.email : null,
  };
}
