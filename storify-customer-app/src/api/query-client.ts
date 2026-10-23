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
  /** The same for everybody and changed by the merchant: config, home, a product. */
  public: 60 * SECOND,
  /** One shopper's own: cart, account. Always checked. */
  private: 0,
} as const;

const PERSIST_MAX_AGE = 7 * DAY;

/**
 * Spread into the few queries worth keeping across restarts: config, home and
 * cart. They are what the first screen needs, so the app opens with content
 * instead of a spinner, then refreshes behind it. Nothing else is stored.
 */
export const PERSISTED = {
  meta: { persist: true },
  gcTime: PERSIST_MAX_AGE,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE.public,
      gcTime: 10 * 60 * SECOND,
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
      retryDelay: (attempt) => Math.min(SECOND * 2 ** attempt, 8 * SECOND),
    },
    mutations: {
      // Sending a change twice is only safe when the endpoint is built for it.
      // A mutation that is (it sets a value, or carries an Idempotency-Key)
      // asks for retries itself.
      retry: false,
    },
  },
});

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
    const subscription = Network.addNetworkStateListener((state) => {
      // "Unknown" counts as online: better a request that fails than one never made.
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return () => subscription.remove();
  });
}
