import { useEffect } from 'react';

/**
 * The conversation whose thread is in front, if any. A push about a new
 * message in it is not shown as a banner (the thread shows the message
 * itself); see `usePushRefresh` (features/devices).
 */
let onScreen: string | null = null;

export function conversationOnScreen(): string | null {
  return onScreen;
}

/** Marks the thread as the one in front while it is focused. */
export function useConversationOnScreen(id: string, focused: boolean): void {
  useEffect(() => {
    if (!focused) return;
    onScreen = id;
    return () => {
      if (onScreen === id) onScreen = null;
    };
  }, [id, focused]);
}
