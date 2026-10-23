import { useQueryClient } from '@tanstack/react-query';
import { addNotificationReceivedListener } from 'expo-notifications';
import { useEffect } from 'react';

import { queryKeys } from '@/api/query-keys';
import { pushTarget, readPushData } from '@/features/devices/push-refresh';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';
import { notificationWorkspace } from '@/lib/links';

/** The store's push types about an order: a new one, and a step somebody took. */
const ORDER_PUSHES = new Set(['order_placed', 'order_status']);

/**
 * Reads the orders again when a push about one arrives while the app is open:
 * the lists, Home's figures, and the order it names. The store has no live
 * stream; each read goes out with its ETag. A push about the
 * operator's other workspace leaves this one alone: switching reads afresh.
 *
 * Mounted once, in the root layout. The browser preview receives no
 * notifications (`.web.ts`).
 */
export function useOrderPushRefresh(): void {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!scope) return;

    const subscription = addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      const { url, type } = readPushData(data);
      const target = pushTarget(data);
      const aboutOrders =
        (type !== null && ORDER_PUSHES.has(type)) ||
        target?.screen === 'order' ||
        target?.screen === 'orders';
      if (!aboutOrders) return;
      const workspace = url ? notificationWorkspace(url) : null;
      if (workspace && workspace !== scope.workspace) return;

      void queryClient.invalidateQueries({ queryKey: queryKeys.orderLists(scope) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home(scope) });
      if (target?.screen === 'order') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.order(scope, target.id) });
      }
    });
    return () => subscription.remove();
  }, [scope, queryClient]);
}
