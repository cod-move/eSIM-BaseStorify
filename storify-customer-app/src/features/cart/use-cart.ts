import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getCart, getCartVendor, removeCartLine, setCartLine } from '@/api/endpoints/cart';
import { isRetryable } from '@/api/errors';
import { etagQuery, selectData, type Cached } from '@/api/etag-query';
import { PERSISTED, STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { Cart, SetCartLineRequest } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/**
 * The cart, as the store holds it. The app keeps no cart of its own: prices,
 * totals and what may be bought are the store's, and every change is sent and
 * answered with the whole cart.
 */
export function useCart() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.cart(locale),
    queryFn: etagQuery((options) => getCart(locale, options)),
    select: selectData,
    staleTime: STALE.private,
    ...PERSISTED,
  });
}

/** The number on the cart's badge. */
export function useCartCount(): number {
  return useCart().data?.itemCount ?? 0;
}

/**
 * Sets how many of a product are in the cart.
 *
 * The request says "make it N", not "add one", so it can be sent again after a
 * lost connection without buying twice. That is why this mutation retries when
 * the rest of the app's mutations do not.
 */
export function useSetCartLine() {
  const locale = useLocale();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (line: SetCartLineRequest) => setCartLine(locale, line),
    retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
    onSuccess: (cart) => {
      queryClient.setQueryData<Cached<Cart>>(queryKeys.cart(locale), { data: cart });
    },
  });
}

/**
 * The seller of a group of lines, for its tile. Without a slug (the store's
 * own lines) nothing is asked. While it loads, or if the store has no page for
 * the seller, the tile shows the name the line carries.
 */
export function useCartVendor(slug: string | undefined) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.cartVendor(locale, slug ?? ''),
    queryFn: ({ signal }) => getCartVendor(locale, slug ?? '', signal),
    enabled: slug !== undefined,
    staleTime: STALE.public,
  });
}

export function useRemoveCartLine() {
  const locale = useLocale();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (lineKey: string) => removeCartLine(locale, lineKey),
    retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
    onSuccess: (cart) => {
      queryClient.setQueryData<Cached<Cart>>(queryKeys.cart(locale), { data: cart });
    },
  });
}
