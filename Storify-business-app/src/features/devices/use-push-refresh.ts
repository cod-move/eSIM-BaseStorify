import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { addNotificationReceivedListener, setNotificationHandler } from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { conversationOnScreen } from '@/features/inbox/conversation-on-screen';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

import { pushRefreshKeys, pushTarget } from './push-refresh';

/** Whether a push is about what the operator is reading: a message of the thread in front. */
function onScreen(data: unknown): boolean {
  try {
    const target = pushTarget(data);
    return target?.screen === 'conversation' && target.id === conversationOnScreen();
  } catch {
    // A push the app cannot read is shown as it came.
    return false;
  }
}

/**
 * A push that arrives while the app is open: it shows
 * as a banner (without a handler the phone would not show it at all), unless
 * it is a message of the thread on screen; and what it is about is read again
 * at once: the inbox and its badge for a message, the low-stock list for low
 * stock, the notifications for every one (orders: `useOrderPushRefresh`).
 * Push is best effort: the screens still read again on their own (the
 * foreground, pull to refresh, a thread's polling).
 *
 * Mounted once, in the root layout. The browser preview receives no push
 * (`.web.ts`).
 */
export function usePushRefresh(): void {
  const queryClient = useQueryClient();
  const scope = useWorkspaceScope();
  // Read when a push arrives, without listening again on every change.
  const current = useRef(scope);
  useEffect(() => {
    current.current = scope;
  }, [scope]);

  useEffect(() => {
    setNotificationHandler({
      handleNotification: async (notification) => {
        const quiet = onScreen(notification.request.content.data);
        return {
          shouldShowBanner: !quiet,
          shouldShowList: !quiet,
          shouldPlaySound: !quiet,
          shouldSetBadge: false,
        };
      },
    });
    const subscription = addNotificationReceivedListener((notification) => {
      let keys: QueryKey[];
      try {
        keys = pushRefreshKeys(notification.request.content.data, current.current);
      } catch {
        // What a push the app cannot read is about stays unknown: the screens read again on their own.
        return;
      }
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    });
    return () => {
      subscription.remove();
      setNotificationHandler(null);
    };
  }, [queryClient]);
}
