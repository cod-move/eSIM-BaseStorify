import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';

import {
  createReturn,
  getMyReturn,
  getMyReturns,
  getReturnOptions,
  previewReturn,
} from '@/api/endpoints/returns';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { CreateReturnRequest, ReturnPreviewRequest } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

const PAGE_SIZE = 20;

/** The shopper's returns, newest first, a page at a time. */
export function useMyReturns() {
  const locale = useLocale();

  return useInfiniteQuery({
    queryKey: queryKeys.returnList(locale),
    queryFn: ({ pageParam, signal }) =>
      getMyReturns(locale, { cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    staleTime: STALE.private,
  });
}

/** One return: where it stands, its refund, and when each step happened. */
export function useMyReturn(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.returnDetail(locale, id),
    queryFn: ({ signal }) => getMyReturn(locale, id, signal),
    staleTime: STALE.private,
  });
}

/** The store's reasons for this order, and whether the refund needs a destination. */
export function useReturnOptions(orderId: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.returnOptions(locale, orderId),
    queryFn: ({ signal }) => getReturnOptions(locale, orderId, signal),
    staleTime: STALE.private,
  });
}

/**
 * The refund as the store would pay it for the selection. A new selection is
 * a new question, so the store is asked again; nothing is asked until a line
 * and a reason are chosen.
 */
export function useReturnPreview(orderId: string, request: ReturnPreviewRequest | null) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.returnPreview(locale, orderId, request),
    queryFn: request ? ({ signal }) => previewReturn(locale, orderId, request, signal) : skipToken,
    staleTime: STALE.private,
  });
}

/**
 * Sends the request. The flow makes one `Idempotency-Key` and sends every
 * attempt with it, so a retry after a lost answer gets the same returns back,
 * never new ones. A second tap while one is on its way, or after the store
 * has answered, sends nothing.
 */
export function useSubmitReturn(orderId: string, makeKey: () => string = randomUUID) {
  const locale = useLocale();
  const client = useQueryClient();
  const [key] = useState(makeKey);
  // Refs, not state: two taps in the same frame both see the first one.
  const sending = useRef(false);
  const done = useRef(false);

  const mutation = useMutation({
    mutationFn: (body: CreateReturnRequest) => createReturn(locale, orderId, body, key),
    onSuccess: () => {
      done.current = true;
      void client.invalidateQueries({ queryKey: queryKeys.returnList(locale) });
      void client.invalidateQueries({ queryKey: queryKeys.order(locale, orderId) });
      // Every order list: its row may no longer offer "Request return".
      void client.invalidateQueries({ queryKey: queryKeys.orderList(locale, {}).slice(0, 4) });
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const submit = (body: CreateReturnRequest) => {
    if (sending.current || done.current) return;
    sending.current = true;
    mutation.mutate(body);
  };

  return { ...mutation, submit };
}
