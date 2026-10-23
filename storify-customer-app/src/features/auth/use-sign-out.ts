import { useCallback, useState } from 'react';

import { clearCartToken } from '@/api/api';
import { authClient } from '@/lib/auth-client';

import { runSignOutTasks } from './sign-out-tasks';

/**
 * Signing out of this phone, in three steps:
 *
 * 1. The sign-out tasks, while the session still works: they take off the
 *    account what belongs to this phone (its push token). Each gets a few
 *    seconds, and none can keep the shopper signed in.
 * 2. The store closes this session, and the phone forgets it. With no
 *    connection the phone forgets it all the same: the Expo plugin drops the
 *    stored session before the request goes out.
 * 3. The guest cart's token goes too, so whoever uses the phone next starts
 *    with an empty cart rather than one left from before the sign-in.
 *
 * Dropping the cached data of the shopper who left is `useSessionSync`'s job,
 * as for any change of person.
 */
export function useSignOut() {
  const [isPending, setPending] = useState(false);

  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await runSignOutTasks();
      // Throws only with no answer at all, which is no reason to stay signed in.
      await authClient.signOut().catch(() => undefined);
    } finally {
      clearCartToken();
      setPending(false);
    }
  }, []);

  return { signOut, isPending };
}
