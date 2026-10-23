import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const isOnline = () => onlineManager.isOnline();

/**
 * Whether the phone has a connection now, as the data layer sees it. A change
 * is never sent offline (`useKeyedMutation`); a screen with steps says so
 * before the operator taps.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, isOnline);
}
