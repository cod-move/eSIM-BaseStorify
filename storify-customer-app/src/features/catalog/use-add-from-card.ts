import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { queryKeys } from '@/api/query-keys';
import type { ProductCard, Wishlist } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useAddFromCard, useSetWishlisted, useWishlist } from '@/features/wishlist/use-wishlist';
import { useLocale } from '@/i18n/locale-store';

type WishlistPages = InfiniteData<Wishlist, string | undefined>;

/** What a screen gives a `ProductCard` so its cart button and heart work. */
export type CardActions = {
  onAddToCart: (product: ProductCard) => void;
  onToggleWishlist: (product: ProductCard) => void;
  isWishlisted: boolean;
  busy: boolean;
};

/**
 * The cart button and the heart of every card on a screen. Spread what the
 * returned function answers for a product onto its `ProductCard`:
 * `<ProductCard product={p} {...cardActions(p)} />`.
 *
 * The cart button adds one, or opens the product's page when the store says an
 * option has to be chosen. The heart saves or unsaves the product, and sends a
 * guest to sign in: the store keeps no wishlist for guests. Which hearts are
 * filled comes from the shopper's wishlist, loaded in full (it is the shopper's
 * own short list) so a card on any page of a long list tells the truth.
 */
export function useCardActions(): (product: ProductCard) => CardActions {
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { isSignedIn } = useSession();
  const wishlist = useWishlist();
  const setWishlisted = useSetWishlisted();
  const addFromCard = useAddFromCard();

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = wishlist;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const savedIds = useMemo(
    () => new Set((wishlist.data ?? []).map((item) => item.product.id)),
    [wishlist.data]
  );

  const toggleWishlist = (product: ProductCard) => {
    if (!isSignedIn) {
      router.push('/login');
      return;
    }
    const wishlisted = !savedIds.has(product.id);
    const key = queryKeys.wishlist(locale);
    const previous = queryClient.getQueryData<WishlistPages>(key);
    // Saving shows at once on every card of every screen; removing already does (useSetWishlisted).
    const first = previous?.pages[0];
    if (wishlisted && previous && first) {
      const item = { product, addedAt: new Date().toISOString() };
      queryClient.setQueryData<WishlistPages>(key, {
        ...previous,
        pages: [{ ...first, items: [item, ...first.items] }, ...previous.pages.slice(1)],
      });
    }
    setWishlisted.mutate(
      { productId: product.id, wishlisted },
      {
        onError: () => {
          if (previous) queryClient.setQueryData(key, previous);
        },
      }
    );
  };

  return (product) => ({
    onAddToCart: addFromCard.add,
    onToggleWishlist: toggleWishlist,
    isWishlisted: savedIds.has(product.id),
    busy: addFromCard.busyProductId === product.id,
  });
}
