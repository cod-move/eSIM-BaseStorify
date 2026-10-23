import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';

/**
 * Whether the phone is offline, as expo-network sees it. The offline banner
 * reads it to show itself, the transport to refuse a change it cannot send.
 *
 * The phone is watched from the first time anything asks, and for as long as
 * the app runs: one listener for the whole app.
 */

/**
 * Offline only when the phone says so. "Unknown" counts as online: better a
 * request that fails than one never made.
 */
export function isOfflineState(state: Network.NetworkState): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

let offline = false;
let watching = false;
const listeners = new Set<() => void>();

function update(next: boolean): void {
  if (next === offline) return;
  offline = next;
  for (const listener of listeners) listener();
}

function watch(): void {
  if (watching) return;
  watching = true;

  // An event can arrive before the first reading does: then it is the newer one.
  let heard = false;
  Network.addNetworkStateListener((state) => {
    heard = true;
    update(isOfflineState(state));
  });
  // A phone that cannot tell at all stays "online".
  void Promise.resolve()
    .then(() => Network.getNetworkStateAsync())
    .then(
      (state) => {
        if (!heard) update(isOfflineState(state));
      },
      () => undefined
    );
}

/** Whether the phone is offline right now. */
export function isOffline(): boolean {
  watch();
  return offline;
}

/** Calls `listener` each time the phone goes offline or comes back. Returns the way to stop. */
export function subscribeToNetwork(listener: () => void): () => void {
  watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the phone is offline, for a component: it draws again when that changes. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribeToNetwork, isOffline, () => false);
}
