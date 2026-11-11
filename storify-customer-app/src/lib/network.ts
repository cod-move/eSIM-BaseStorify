import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

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
  // [esim-patch] P55 only a phone with no connection: Android judges "internet reachable" by
  // reaching Google, which fails in mainland China and would leave the app offline for good.
  return state.isConnected === false;
}

let offline = false;
let watching = false;
const listeners = new Set<() => void>();

function update(next: boolean): void {
  if (next === offline) return;
  offline = next;
  for (const listener of listeners) listener();
}

/**
 * [esim-patch] P55 reads the phone's network again. Android does not always
 * tell a backgrounded app that the network came back (the photo picker, a
 * locked screen), so a state heard in the background can be stale: it is read
 * afresh when the app comes to the front, and before a change is refused.
 */
function refresh(): Promise<boolean> {
  return Promise.resolve()
    .then(() => Network.getNetworkStateAsync())
    .then(
      (state) => {
        update(isOfflineState(state));
        return offline;
      },
      () => offline
    );
}

/** Whether the phone is offline, read afresh when it was last heard to be (P55). */
export function confirmOffline(): Promise<boolean> {
  watch();
  return offline ? refresh() : Promise.resolve(false);
}

function watch(): void {
  if (watching) return;
  watching = true;

  // [esim-patch] P55 back in the front: the state heard in the background may be stale.
  AppState.addEventListener('change', (status) => {
    if (status === 'active') void refresh();
  });

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
