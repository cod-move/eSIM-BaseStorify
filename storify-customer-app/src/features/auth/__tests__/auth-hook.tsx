import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { mockFetch, resetMockServer } from '@/api/mocks/server';
import { queryKeys } from '@/api/query-keys';
import { API_BASE_PATH, type Config } from '@/contracts/mobile/shop/v1';
import { env } from '@/config/env';
import { getMessages } from '@/i18n/messages';
import { authClient } from '@/lib/auth-client';

// The app's config in jest.setup.ts carries the scheme, but not that the app is
// installed on a phone: without it the Expo client of the auth library cannot
// work out the app's address (`expo-linking` asks the Expo Go app instead) and
// every call fails before it is sent. `expo-linking` reads this on each call.
Object.defineProperty(Constants, 'executionEnvironment', {
  configurable: true,
  value: ExecutionEnvironment.Standalone,
});

/**
 * What the tests of the auth hooks share: the hook rendered in English, on the
 * mock store, with the store's settings already known, and a phone that holds
 * no session.
 *
 * The settings are the mock store's, unless a test gives other auth settings
 * (`null`: a store that sends none).
 */
export async function renderAuthHook<T>(
  hook: () => T,
  { auth }: { auth?: Config['auth'] | null } = {}
) {
  const response = await mockFetch(`${env.apiUrl}${API_BASE_PATH}/en/config`);
  const { data } = await response.json();
  const { auth: storeAuth, ...store } = data;

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.config('en'), {
    data: auth === null ? store : { ...store, auth: auth ?? storeAuth },
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
}

/**
 * How long the auth library's session store stays awake after its last reader
 * leaves (nanostores' unmount delay, 1 s), and a little more.
 */
const SESSION_STORE_SLEEPS_AFTER_MS = 1100;

/**
 * Every test file that shares these helpers waits, at its end, until the auth
 * library is quiet. A sign-out (`startFresh` before each test) wakes its
 * session store, and an awake store asks the store again who is signed in
 * whenever the cookie changes. Without the wait the last of those requests
 * lands after Jest has torn the file's environment down.
 */
afterAll(() =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, SESSION_STORE_SLEEPS_AFTER_MS)))
);

/** A fresh mock store, and a phone that has forgotten every cookie the last test left. */
export async function startFresh(): Promise<void> {
  await act(async () => {
    await authClient.signOut().catch(() => undefined);
  });
  resetMockServer();
}
