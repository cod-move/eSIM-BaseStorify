import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getMeProduct, setWishlisted } from '@/api/endpoints/me';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { MeProduct } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/**
 * The shopper's own half of the product page.
 *
 * The product itself is public: one answer serves everybody and can sit in a
 * cache. What is personal (is it in my wishlist, may I review it) is asked
 * separately and at the same time, only when somebody is signed in. Every
 * screen that mixes the two follows this split.
 */
export function useMeProduct(productId: string | undefined) {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useQuery({
    queryKey: queryKeys.meProduct(locale, productId ?? ''),
    queryFn: ({ signal }) => getMeProduct(locale, productId ?? '', signal),
    enabled: isSignedIn && productId !== undefined,
    staleTime: STALE.private,
  });
}

/**
 * Adds the product to the wishlist or takes it out. The heart changes at once
 * and is put back if the store refuses. Whichever screen the heart is on, the
 * wishlist is asked again afterwards, so it never shows a stale list.
 */
export function useToggleWishlist(productId: string) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const key = queryKeys.meProduct(locale, productId);

  return useMutation({
    mutationFn: (wishlisted: boolean) => setWishlisted(locale, productId, wishlisted),
    onMutate: async (wishlisted) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MeProduct>(key);
      if (previous)
        queryClient.setQueryData<MeProduct>(key, { ...previous, inWishlist: wishlisted });
      return { previous };
    },
    onError: (_error, _wishlisted, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(locale) }),
      ]),
  });
}
