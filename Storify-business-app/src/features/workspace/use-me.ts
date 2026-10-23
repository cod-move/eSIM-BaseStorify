import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/endpoints/me';
import { PERSISTED } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/**
 * GET /me: who the operator is, and what they may do in each workspace. Kept
 * on the device, so the app opens with its tabs at once; asked again on every
 * return to the foreground, so a role, a permission or a seller's status
 * changed by somebody else applies at once. Asked only while signed in.
 *
 * It is kept per language. On a change of language the answer in the old one
 * stays until the new one arrives: without it the workspace would turn
 * `loading` for a moment, the screens of the workspace would close and its
 * cached data would be thrown away.
 *
 * It is asked even when the phone says it is offline (`networkMode: 'always'`):
 * a first start with no connection then fails, and `Booting` offers to try
 * again or sign out, instead of a spinner that waits for the connection.
 */
export function useMe() {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useQuery({
    queryKey: queryKeys.me(locale),
    queryFn: isSignedIn ? ({ signal }) => getMe(locale, signal) : skipToken,
    networkMode: 'always',
    placeholderData: keepPreviousData,
    ...PERSISTED,
  });
}
