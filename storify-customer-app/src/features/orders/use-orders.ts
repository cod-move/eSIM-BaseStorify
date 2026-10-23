import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { cancelOrder, getOrder, getOrders } from '@/api/endpoints/orders';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

import { isActiveOrder } from './active-orders';

const PAGE_SIZE = 20;

/** The shopper's orders, newest first, a page at a time. */
export function useOrders() {
  const locale = useLocale();

  return useInfiniteQuery({
    queryKey: queryKeys.orderList(locale, {}),
    queryFn: ({ pageParam, signal }) =>
      getOrders(locale, { cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    staleTime: STALE.private,
  });
}

/** One order, with its lines, totals and parcels. */
export function useOrder(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.order(locale, id),
    queryFn: ({ signal }) => getOrder(locale, id, signal),
    staleTime: STALE.private,
  });
}

/**
 * Calls the order off. The store answers with the order as it now is,
 * which replaces the copy on screen; the history is asked for again.
 */
export function useCancelOrder(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => cancelOrder(locale, id),
    onSuccess: (result) => {
      client.setQueryData(queryKeys.order(locale, id), result.order);
      void client.invalidateQueries({ queryKey: queryKeys.orderList(locale, {}) });
    },
    // A refusal (409) means the order moved on: show it as it is now.
    onError: () => void client.invalidateQueries({ queryKey: queryKeys.order(locale, id) }),
  });
}

/** The most pages read in search of an order still on its way, before saying there is none. */
const ACTIVE_PAGES = 5;

/**
 * The orders still on their way (`isActiveOrder`), for "Track Orders". The
 * store has no filter for them, so the history is read newest first, and
 * further pages are asked for while none of the pages read has one.
 */
export function useActiveOrders() {
  const orders = useOrders();
  const active = orders.data?.filter(isActiveOrder) ?? [];
  const pagesRead = orders.data === undefined ? 0 : Math.ceil(orders.data.length / PAGE_SIZE);
  const searching =
    active.length === 0 && orders.hasNextPage && pagesRead < ACTIVE_PAGES && !orders.isError;

  const { fetchNextPage, isFetchingNextPage } = orders;
  useEffect(() => {
    if (searching && !isFetchingNextPage) void fetchNextPage();
  }, [searching, isFetchingNextPage, fetchNextPage]);

  return { ...orders, active, searching };
}
