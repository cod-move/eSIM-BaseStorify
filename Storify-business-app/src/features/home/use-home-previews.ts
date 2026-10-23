import { skipToken, useQuery } from '@tanstack/react-query';

import { getConversations } from '@/api/endpoints/inbox';
import { getOrders } from '@/api/endpoints/orders';
import { etagQuery, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';

/** Existing scoped endpoints, bounded first pages; no per-item detail requests. */
export function useHomeOrders(enabled: boolean) {
  const scope = useWorkspaceScope();
  const can = useCan('VIEW_ORDERS');
  return useQuery({
    queryKey: queryKeys.homeOrders(scope),
    queryFn:
      scope && can && enabled
        ? etagQuery((options) => getOrders(scope, { tab: 'needs_action', limit: 3 }, options))
        : skipToken,
    select: selectData,
  });
}

/** Reading the preview never marks a conversation read. */
export function useHomeConversations(enabled: boolean) {
  const scope = useWorkspaceScope();
  const can = useCan('VIEW_INBOX');
  return useQuery({
    queryKey: queryKeys.homeConversations(scope),
    queryFn:
      scope && can && enabled
        ? etagQuery((options) => getConversations(scope, { unreadOnly: true, limit: 2 }, options))
        : skipToken,
    select: selectData,
  });
}
