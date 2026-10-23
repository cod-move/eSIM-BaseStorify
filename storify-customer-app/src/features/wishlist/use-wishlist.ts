import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { setWishlisted } from '@/api/endpoints/me';
import { getWishlist } from '@/api/endpoints/wishlist';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { ProductCard, Wishlist } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useCart, useSetCartLine } from '@/features/cart/use-cart';
import { useLocale } from '@/i18n/locale-store';

const PAGE_SIZE = 20;

type Pages = InfiniteData<Wishlist, string | undefined>;

/** The saved products, newest first, page after page. Asked for only when somebody is signed in. */
export function useWishlist() {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useInfiniteQuery({
    queryKey: queryKeys.wishlist(locale),
    queryFn: ({ pageParam, signal }) =>
      getWishlist(locale, { cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
}

/** The pages with one product taken out. */
export function withoutProduct(data: Pages, productId: string): Pages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.product.id !== productId),
    })),
  };
}

/**
 * Takes a product out of the wishlist, or puts it back (the "Undo"). Taking
 * out shows at once and is undone if the store refuses.
 */
export function useSetWishlisted() {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const key = queryKeys.wishlist(locale);

  return useMutation({
    mutationFn: ({ productId, wishlisted }: { productId: string; wishlisted: boolean }) =>
      setWishlisted(locale, productId, wishlisted),
    onMutate: async ({ productId, wishlisted }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Pages>(key);
      if (previous && !wishlisted)
        queryClient.setQueryData(key, withoutProduct(previous, productId));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: (_answer, _error, { productId }) => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.meProduct(locale, productId) });
    },
  });
}

/**
 * The card's cart button: one more of the product, or its page when the store
 * says an option has to be chosen first.
 */
export function useAddFromCard() {
  const router = useRouter();
  const cart = useCart();
  const setLine = useSetCartLine();

  const add = (product: ProductCard) => {
    if (product.requiresVariantChoice) {
      router.push({ pathname: '/products/[slug]', params: { slug: product.slug } });
      return;
    }
    const line = cart.data?.lines.find((l) => l.productId === product.id && !l.variantId);
    setLine.mutate({ productId: product.id, quantity: (line?.quantity ?? 0) + 1 });
  };

  return { add, busyProductId: setLine.isPending ? setLine.variables.productId : undefined };
}
