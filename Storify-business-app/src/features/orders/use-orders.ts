import { skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { getOrder, getOrders, postOrderAction } from '@/api/endpoints/orders';
import { isApiError } from '@/api/errors';
import { etagPages, etagQuery, nextCursor, selectData, type Cached } from '@/api/etag-query';
import { useKeyedMutation } from '@/api/keyed-mutation';
import { showAnswer } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import {
  OrderDetail,
  type OrderActionRequest,
  type OrderList,
  type OrderListQuery,
} from '@/contracts/mobile/biz/v1';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

/** What the list is filtered by: the tab, the search, and one customer's. */
export type OrderFilter = Pick<OrderListQuery, 'tab' | 'search' | 'customerId'>;

/**
 * The orders of a tab (and search), newest first, a page at a time. Every page
 * is revalidated with its ETag, so pulling to refresh an unchanged list costs
 * a 304. Read it again on pull to refresh, on a push about an order and on
 * returning to the foreground; the cursor continues after the last row shown,
 * so an order placed meanwhile never repeats a row.
 */
export function useOrders(filter: OrderFilter = {}) {
  const scope = useWorkspaceScope();

  return useInfiniteQuery({
    queryKey: queryKeys.orderList(scope, filter),
    queryFn: scope
      ? etagPages<OrderList>((cursor, options) => getOrders(scope, { ...filter, cursor }, options))
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data.items),
  });
}

/** One order, revalidated with its ETag. */
export function useOrder(id: string) {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.order(scope, id),
    queryFn: scope && id ? etagQuery((options) => getOrder(scope, id, options)) : skipToken,
    select: selectData,
  });
}

/**
 * The order as it is now, when an action lost a race (409
 * `ORDER_STATE_CHANGED`: somebody else moved it between the read and the tap);
 * `null` for any other error.
 */
export function orderStateChanged(error: unknown): OrderDetail | null {
  if (!isApiError(error) || error.reason !== 'ORDER_STATE_CHANGED') return null;
  const order = OrderDetail.safeParse(error.details?.order);
  return order.success ? order.data : null;
}

/**
 * Takes the workflow's next step (`mark_processing`, `mark_shipped` with
 * `carrier` and `trackingNumber`, `mark_delivered`, `cancel` with `reason`):
 * one `Idempotency-Key` per tap, the same for that tap's retries.
 *
 * After it, the screen's order is the store's answer, and the lists and Home
 * are asked again (the order moved tab). When somebody else moved the order
 * first, the screen's order becomes the one in the refusal
 * (`orderStateChanged(error)`), and the screen says so. Every other refusal's
 * `reason` is in the contract (`ORDER_ACTION_REASONS`); `CANCEL_NEEDS_REFUND`
 * means "cancel it on the website", where the refund is made.
 */
export function useOrderAction(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  // Kept without a validator: the next read asks in full and gets the ETag. A
  // read of the order already on its way (a pull, a push, the foreground) is
  // stopped first: it would land after the answer and show the order as it was.
  const showOrder = (from: WorkspaceScope | null, order: OrderDetail) =>
    showAnswer<Cached<OrderDetail>>(queryClient, queryKeys.order(from, id), { data: order });

  return useKeyedMutation({
    attemptKey: () => ['order-action', scope?.workspace, id],
    send: (request: OrderActionRequest, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return postOrderAction(scope, id, request, idempotencyKey);
    },
    // The workspace the step goes out from. The hook's own scope follows the
    // screen: a step still on its way when the operator switches would
    // otherwise put its answer among the other workspace's orders.
    onMutate: () => scope,
    onSuccess: (result, _request, from) => showOrder(from ?? null, result.order),
    onError: async (error, _request, sentFrom) => {
      const from = sentFrom ?? null;
      const current = orderStateChanged(error);
      if (current) await showOrder(from, current);
      else void queryClient.invalidateQueries({ queryKey: queryKeys.order(from, id) });
    },
    onSettled: (_result, _error, _request, sentFrom) => {
      const from = sentFrom ?? null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderLists(from) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home(from) });
    },
  });
}
