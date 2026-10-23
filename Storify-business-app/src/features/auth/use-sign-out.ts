import { useCallback, useState } from 'react';
import { create } from 'zustand';

import { authClient } from '@/lib/auth-client';

import { runSignOutTasks } from './sign-out-tasks';

/** Whether a sign-out is on its way: the root layout covers the screens meanwhile. */
const useSignOutState = create<{ active: boolean }>(() => ({ active: false }));

/** True from the moment a sign-out starts until the phone has forgotten the session. */
export function useSigningOut(): boolean {
  return useSignOutState((state) => state.active);
}

/**
 * Asks the store to close this session. Resolves as soon as the phone has
 * forgotten it, which the Expo plugin does before the request goes out
 * (`onRequest` runs after it), or when the call fails before that. The store's
 * answer is not waited for: with a poor connection it may take until the auth
 * client gives up (`lib/auth-client.ts`), and the operator is signed out of
 * this phone already.
 */
function closeSession(): Promise<void> {
  return new Promise((forgotten) => {
    authClient
      .signOut({ fetchOptions: { onRequest: () => forgotten() } })
      // Throws only with no answer at all, which is no reason to stay signed in.
      .then(
        () => forgotten(),
        () => forgotten()
      );
  });
}

/**
 * Signing out of this phone, in two steps:
 *
 * 1. The sign-out tasks, while the session still works: they take off the
 *    account what belongs to this phone (its push token). Each gets a few
 *    seconds, and none can keep the operator signed in.
 * 2. The phone forgets the session and asks the store to close it. With no
 *    connection the phone forgets it all the same: the Expo plugin drops the
 *    stored session before the request goes out.
 *
 * Meanwhile the screens are covered (`useSigningOut`): the session going
 * takes every signed-in screen away at once, and nothing on them can be
 * pressed, or start a request, on the way out. A sheet that asks for the
 * sign-out closes before it starts (`SignOutRow`), so no sheet is taken down
 * with its screen while still on show.
 *
 * Dropping the cached data of the operator who left is `useSessionSync`'s job,
 * as for any change of person.
 */
export function useSignOut() {
  const [isPending, setPending] = useState(false);

  const signOut = useCallback(async () => {
    if (useSignOutState.getState().active) return;
    setPending(true);
    useSignOutState.setState({ active: true });
    try {
      await runSignOutTasks();
      await closeSession();
    } finally {
      useSignOutState.setState({ active: false });
      setPending(false);
    }
  }, []);

  return { signOut, isPending };
}
