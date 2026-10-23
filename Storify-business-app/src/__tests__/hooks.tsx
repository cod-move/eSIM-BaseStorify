import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { STORE_UNMOUNT_DELAY } from 'nanostores';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { clearAttempts } from '@/api/keyed-mutation';
import { MOCK_PASSWORD, resetMockServer } from '@/api/mocks/server';
import { queryClient } from '@/api/query-client';
import { dismissToast } from '@/components/ui/toast';
import { clearPendingReplies } from '@/features/inbox/pending-replies';
import { clearPayoutCurrencies } from '@/features/more/payout-currency';
import { clearProductDrafts } from '@/features/products/editor/drafts';
import { clearCreationDrafts } from '@/features/orders/creation/draft';
import { clearReturnDrafts } from '@/features/returns/store';
import { clearPendingNotificationOpen } from '@/features/shell/use-open-notification';
import { useWorkspaceSync } from '@/features/workspace/use-workspace-sync';
import { useWorkspaceStore } from '@/features/workspace/workspace-store';
import { useLocaleStore } from '@/i18n/locale-store';
import { getMessages } from '@/i18n/messages';
import { authClient } from '@/lib/auth-client';

/**
 * What the tests of the data hooks share: a hook rendered in English with the
 * app's own query client, on the mock store, signed in through the real auth
 * client as the operator a test names.
 *
 * A test of a screen (A2–A5) renders the app with `renderRouter('./src/app')`
 * instead; the same `startFresh` applies.
 */

// The app's config in jest.setup.ts carries the scheme, but not that the app is
// installed on a phone: without it the Expo client of the auth library cannot
// work out the app's address (`expo-linking` asks the Expo Go app instead) and
// every call fails before it is sent. `expo-linking` reads this on each call.
Object.defineProperty(Constants, 'executionEnvironment', {
  configurable: true,
  value: ExecutionEnvironment.Standalone,
});

function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        {children}
        <RootSync />
      </IntlProvider>
    </QueryClientProvider>
  );
}

/** What the root layout runs after its screens. */
function RootSync() {
  useWorkspaceSync();
  return null;
}

export function renderAppHook<T>(hook: () => T) {
  return renderHook(hook, { wrapper: Providers });
}

/** A fresh mock store and cache, and a phone that has forgotten every session and choice. */
export async function startFresh(): Promise<void> {
  await act(async () => {
    await authClient.signOut().catch(() => undefined);
  });
  resetMockServer();
  emptyQueryClient();
  clearAttempts();
  clearPendingReplies();
  clearProductDrafts();
  clearCreationDrafts();
  clearReturnDrafts();
  clearPendingNotificationOpen();
  clearPayoutCurrencies();
  dismissToast();
  localStorage.clear();
  useWorkspaceStore.setState({ choice: null });
  useLocaleStore.setState({ locale: 'en', chosen: false });
}

/** Signs in as the operator, as the sign-in screen would. */
export async function signInAs(email: string): Promise<void> {
  await act(async () => {
    const { error } = await authClient.signIn.email({ email, password: MOCK_PASSWORD });
    if (error) throw new Error(`Sign-in as ${email} failed: ${error.code ?? error.status}`);
  });
}

/**
 * Empties the query client and stops its timers, which would keep Jest
 * waiting. `clear()` stops a query's garbage-collection timer but not a
 * mutation's (five minutes), so mutations are destroyed first.
 */
function emptyQueryClient(): void {
  for (const mutation of queryClient.getMutationCache().getAll()) mutation.destroy();
  queryClient.clear();
}

beforeEach(startFresh);
afterEach(emptyQueryClient);
// The auth client's session store (nanostores) stays mounted for a second
// after its last listener leaves, on a timer. Let it go before Jest tears the
// worker down, or the worker "fails to exit gracefully". (Under the fake timers
// `renderRouter` turns on, that timer is fake too and holds nothing.)
afterAll(async () => {
  jest.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, STORE_UNMOUNT_DELAY + 50));
});
