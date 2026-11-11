import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelEsimNumberPacket,
  getEsimNumber,
  getEsimNumberDataLimit,
  getEsimNumberDiagnostics,
  getEsimNumberPrice,
  getEsimNumberHistory,
  getEsimNumbers,
  getEsimNumberServices,
  getEsimNumberShop,
  getEsimNumberStatement,
  postEsimNumberAction,
  quoteEsimNumber,
  quoteEsimNumberTopup,
  reconnectEsimNumber,
  refreshEsimNumber,
  setEsimNumberDataLimit,
  setEsimNumberForward,
  setEsimNumberRemark,
  setEsimNumberService,
} from '@/api/endpoints/esims';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type {
  EsimNumberDetail,
  EsimNumberPriceQuery,
  EsimNumberQuoteRequest,
  EsimNumberServices,
  EsimNumberShopQuery,
  EsimNumberSwitch,
  EsimNumberTopupQuoteRequest,
} from '@/contracts/mobile/shop/v1/esim';
import { useSetCartLine } from '@/features/cart/use-cart';
import { useLocale } from '@/i18n/locale-store';

import { openNumberStatement } from './number-statement';

/**
 * The phone numbers (NUM-03~09): the numbers on sale, and the shopper's own
 * with what the website's number page does. Reads from the network are never
 * kept long: the card changes with every call and text.
 */

/** The numbers on sale for a filter; the last page stays on screen while the next loads. */
export function useEsimNumberShop(query: EsimNumberShopQuery) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumberShop(locale, query),
    queryFn: ({ signal }) => getEsimNumberShop(locale, query, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** What a choice comes to while the shopper picks; the last answer stays on screen while the next loads. */
export function useEsimNumberPrice(query: EsimNumberPriceQuery, enabled: boolean) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumberPrice(locale, query),
    queryFn: ({ signal }) => getEsimNumberPrice(locale, query, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  });
}

/** Puts a quoted line in the cart, as the store answered with it. */
function useQuotedLine<T>(quote: (input: T) => ReturnType<typeof quoteEsimNumber>) {
  const setLine = useSetCartLine();

  return useMutation({
    mutationFn: async (input: T) => {
      const line = await quote(input);
      await setLine.mutateAsync({
        productId: line.productId,
        variantId: line.variantId,
        quantity: 1,
        lineAttributes: line.lineAttributes,
      });
      return line;
    },
  });
}

/** A number with its first credit and package, into the cart (signed-in shoppers only). */
export function useBuyEsimNumber() {
  const locale = useLocale();
  return useQuotedLine((input: EsimNumberQuoteRequest) => quoteEsimNumber(locale, input));
}

/** Credit or a data package for one of the shopper's numbers, into the cart. */
export function useBuyEsimNumberTopup(id: string) {
  const locale = useLocale();
  return useQuotedLine((input: EsimNumberTopupQuoteRequest) =>
    quoteEsimNumberTopup(locale, id, input)
  );
}

/** The shopper's numbers. */
export function useEsimNumbers(enabled = true) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumberList(locale),
    queryFn: ({ signal }) => getEsimNumbers(locale, signal),
    select: (data) => data.items,
    staleTime: STALE.private,
    enabled,
  });
}

/** One number, read from the network as it opens. */
export function useEsimNumber(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumber(locale, id),
    queryFn: ({ signal }) => getEsimNumber(locale, id, signal),
    staleTime: STALE.private,
  });
}

/** Whatever changes the number's card: the number and the list are read again. */
function useNumberChanged(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return (detail?: EsimNumberDetail) => {
    if (detail) client.setQueryData(queryKeys.esimNumber(locale, id), detail);
    else void client.invalidateQueries({ queryKey: queryKeys.esimNumber(locale, id), exact: true });
    void client.invalidateQueries({ queryKey: queryKeys.esimNumberList(locale) });
  };
}

export function useRefreshEsimNumber(id: string) {
  const locale = useLocale();
  const changed = useNumberChanged(id);

  return useMutation({ mutationFn: () => refreshEsimNumber(locale, id), onSuccess: changed });
}

export function useCancelEsimNumberPacket(id: string) {
  const locale = useLocale();
  const changed = useNumberChanged(id);

  return useMutation({
    mutationFn: (packetId: string) => cancelEsimNumberPacket(locale, id, packetId),
    onSuccess: changed,
  });
}

export function useSetEsimNumberRemark(id: string) {
  const locale = useLocale();
  const changed = useNumberChanged(id);

  return useMutation({
    mutationFn: (remark: string) => setEsimNumberRemark(locale, id, remark),
    onSuccess: () => changed(),
  });
}

/**
 * One of the number's actions (a text, a transfer, a new QR code, a voucher,
 * moving or giving it up). The card is read again after each.
 */
export function useEsimNumberAction(id: string) {
  const locale = useLocale();
  const changed = useNumberChanged(id);

  return useMutation({
    mutationFn: (input: {
      action: Parameters<typeof postEsimNumberAction>[2];
      body: Record<string, unknown>;
    }) => postEsimNumberAction(locale, id, input.action, input.body),
    onSuccess: () => changed(),
  });
}

/** The services, read when the tab opens. */
export function useEsimNumberServices(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumberPart(locale, id, 'services'),
    queryFn: ({ signal }) => getEsimNumberServices(locale, id, signal),
    staleTime: 0,
  });
}

export function useSetEsimNumberService(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { service: EsimNumberSwitch; on: boolean }) =>
      setEsimNumberService(locale, id, input.service, input.on),
    onSuccess: (result) =>
      client.setQueryData<EsimNumberServices>(
        queryKeys.esimNumberPart(locale, id, 'services'),
        (current) => (current ? { ...current, [result.service]: result.on } : current)
      ),
  });
}

export function useSetEsimNumberForward(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (to: string | null) => setEsimNumberForward(locale, id, to),
    onSuccess: (result) =>
      client.setQueryData<EsimNumberServices>(
        queryKeys.esimNumberPart(locale, id, 'services'),
        (current) =>
          current ? { ...current, forwardTo: result.forwardTo, forwardKnown: true } : current
      ),
  });
}

export function useEsimNumberDataLimit(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumberPart(locale, id, 'data-limit'),
    queryFn: ({ signal }) => getEsimNumberDataLimit(locale, id, signal),
    staleTime: 0,
  });
}

export function useSetEsimNumberDataLimit(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (valueMinor: number | null) => setEsimNumberDataLimit(locale, id, valueMinor),
    onSuccess: (result) =>
      client.setQueryData(queryKeys.esimNumberPart(locale, id, 'data-limit'), result),
  });
}

export function useEsimNumberHistory(id: string, days: number) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumberPart(locale, id, `history-${days}`),
    queryFn: ({ signal }) => getEsimNumberHistory(locale, id, days, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}

export function useEsimNumberDiagnostics(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimNumberPart(locale, id, 'diagnostics'),
    queryFn: ({ signal }) => getEsimNumberDiagnostics(locale, id, signal),
    staleTime: 0,
  });
}

export function useReconnectEsimNumber(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => reconnectEsimNumber(locale, id),
    onSettled: () =>
      void client.invalidateQueries({
        queryKey: queryKeys.esimNumberPart(locale, id, 'diagnostics'),
      }),
  });
}

/** Makes the phone bill and hands it to the phone's viewer or share sheet. */
export function useEsimNumberStatement(id: string) {
  const locale = useLocale();

  return useMutation({
    mutationFn: async (range: { from: string; to: string }) => {
      const statement = await getEsimNumberStatement(locale, id, range.from, range.to);
      await openNumberStatement(statement);
    },
  });
}
