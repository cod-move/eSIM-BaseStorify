import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import manifest from '@/contracts/manifest.json';
import { appInfo } from '@/lib/device';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { isRetryable } from './errors';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** Keep the answer on the device, to show it at once on the next start. */
      persist?: boolean;
    };
  }
}

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;

/**
 * How long an answer counts as fresh, per kind of data. Within that time a
 * screen that mounts again shows what it has and asks nothing. After it, the
 * app asks again, which costs little: most answers come back "not modified".
 */
export const STALE = {
  /** The same for everybody and changed by the merchant: the store's settings. */
  public: 60 * SECOND,
  /** The store's own data, which orders, sales and colleagues change at any time. Always checked. */
  private: 0,
} as const;

const PERSIST_MAX_AGE = 7 * DAY;

/**
 * Spread into the few queries worth keeping across restarts: the store's
 * settings and who the operator is (`GET /me`, which decides the tabs). They
 * are what the first screen needs, so the app opens with its shell at once
 * and refreshes behind it. The store's business data (orders, customers,
 * figures) is never written to the device's plain storage.
 */
export const PERSISTED = {
  meta: { persist: true },
  gcTime: PERSIST_MAX_AGE,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE.private,
      gcTime: 10 * 60 * SECOND,
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
      retryDelay: (attempt) => Math.min(SECOND * 2 ** attempt, 8 * SECOND),
    },
    mutations: {
      // Sending a change twice is only safe when the endpoint is built for it.
      // A change that is (it carries an Idempotency-Key) retries by itself
      // (`keyed-mutation.ts`).
      retry: false,
      // A change is never held back to be sent when the connection returns:
      // the operator would not know it went out minutes later. Offline, it
      // fails at once and says so.
      networkMode: 'always',
    },
  },
});

/**
 * Puts the store's answer to a change in the cache. A read of the same thing
 * that started before the change is stopped first: it would land later and
 * put the old figures back.
 */
export async function showAnswer<T>(
  client: QueryClient,
  queryKey: readonly unknown[],
  answer: T
): Promise<void> {
  await client.cancelQueries({ queryKey, exact: true });
  client.setQueryData(queryKey, answer);
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({
    storage: {
      getItem: storage.get,
      setItem: storage.set,
      removeItem: storage.remove,
    },
    key: STORAGE_KEYS.queryCache,
    throttleTime: SECOND,
  }),
  maxAge: PERSIST_MAX_AGE,
  // A new app version or a new contract may read the old answers wrongly:
  // changing either empties the stored cache.
  buster: `${appInfo.version}:${manifest.hash}`,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && query.meta?.persist === true,
  },
};

// React Query refetches what is stale when "the window regains focus" and when
// "the network comes back". On a phone those are: the app returns to the
// foreground, and the connection returns.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });

  onlineManager.setEventListener((setOnline) => {
    // "Unknown" counts as online: better a request that fails than one never made.
    const update = (state: Network.NetworkState) =>
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    const subscription = Network.addNetworkStateListener(update);
    // Android says nothing to the listener when the app starts with no network.
    void Network.getNetworkStateAsync().then(update, () => undefined);
    return () => subscription.remove();
  });
}
