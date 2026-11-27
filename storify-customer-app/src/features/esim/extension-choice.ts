import { useSyncExternalStore } from 'react';

/**
 * Which eSIM payment method the shopper picked in checkout's list (APP-09).
 * The store's quote sends the eSIM methods as one "extension" method with an
 * option each; checkout shows a row per option, and the order is still placed
 * as "extension" — this remembers which row, for `payByRedirect`.
 */
export type ExtensionChoice = { code: string; native: boolean; kind?: 'crypto' | 'sheet' };

let chosen: ExtensionChoice | null = null;
const listeners = new Set<() => void>();

export function chooseExtension(choice: ExtensionChoice | null) {
  chosen = choice;
  for (const listener of listeners) listener();
}

export function chosenExtension(): ExtensionChoice | null {
  return chosen;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChosenExtension(): ExtensionChoice | null {
  return useSyncExternalStore(subscribe, chosenExtension, chosenExtension);
}
