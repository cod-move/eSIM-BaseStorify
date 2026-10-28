import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelEsim,
  getEsim,
  getEsims,
  getEsimTopups,
  quoteEsimTopup,
  refreshEsim,
} from '@/api/endpoints/esims';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useSetCartLine } from '@/features/cart/use-cart';
import { useLocale } from '@/i18n/locale-store';

/** The shopper's eSIMs, newest first. */
export function useEsims() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimList(locale),
    queryFn: ({ signal }) => getEsims(locale, signal),
    select: (data) => data.items,
    staleTime: STALE.private,
  });
}

/** One eSIM, with its usage and how to install it. */
export function useEsim(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esim(locale, id),
    queryFn: ({ signal }) => getEsim(locale, id, signal),
    staleTime: STALE.private,
  });
}

/**
 * Asks the supplier for fresh usage. The store answers with the eSIM as it
 * now is, which replaces the copy on screen; the list is asked for again.
 */
export function useRefreshEsim(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => refreshEsim(locale, id),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.esim(locale, id), detail);
      void client.invalidateQueries({ queryKey: queryKeys.esimList(locale) });
    },
  });
}

/** The top-ups an eSIM can take now. */
export function useEsimTopups(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimTopups(locale, id),
    queryFn: ({ signal }) => getEsimTopups(locale, id, signal),
    staleTime: STALE.private,
  });
}

/** Fixes a top-up and puts it in the cart, as the line the store answered with. */
export function useBuyEsimTopup(id: string) {
  const locale = useLocale();
  const setLine = useSetCartLine();

  return useMutation({
    mutationFn: async (topupPlanId: string) => {
      const quote = await quoteEsimTopup(locale, id, topupPlanId);
      await setLine.mutateAsync({
        productId: quote.productId,
        variantId: quote.variantId,
        quantity: 1,
        lineAttributes: quote.lineAttributes,
      });
      return quote;
    },
  });
}

/** Cancels the eSIM; the store answers with it as it now is, and the list is read again. */
export function useCancelEsim(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => cancelEsim(locale, id),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.esim(locale, id), detail);
      void client.invalidateQueries({ queryKey: queryKeys.esimList(locale) });
    },
  });
}
