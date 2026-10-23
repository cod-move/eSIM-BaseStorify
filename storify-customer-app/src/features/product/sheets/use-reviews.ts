import { useInfiniteQuery } from '@tanstack/react-query';

import { getProductReviews } from '@/api/endpoints/reviews';
import { queryKeys } from '@/api/query-keys';
import type { ImageSet, ProductDetail } from '@/contracts/mobile/shop/v1';
import { useConfig } from '@/features/config/use-config';
import { useLocale } from '@/i18n/locale-store';

import { useProductSeller } from '../use-product';

const PAGE_SIZE = 10;

/**
 * The product's reviews, a page at a time, with the store's summary of all of
 * them. `rating` keeps only the reviews with that many stars;
 * the store filters, and sorts newest first.
 */
export function useProductReviews(slug: string, rating: number | undefined) {
  const locale = useLocale();
  const query = { rating };

  return useInfiniteQuery({
    queryKey: queryKeys.productReviews(locale, slug, query),
    queryFn: ({ pageParam, signal }) =>
      getProductReviews(locale, slug, { ...query, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => ({
      reviews: data.pages.flatMap((page) => page.items),
      summary: data.pages[0]?.summary,
    }),
  });
}

/**
 * Who a reply under a review is from: the seller the product page's
 * tile shows, and the store itself when the product names none.
 */
export function useReplySeller(product: ProductDetail | undefined): {
  name: string;
  logo?: ImageSet;
} {
  const seller = useProductSeller(product);
  const store = useConfig().data?.store;
  return seller ?? { name: store?.name ?? '', logo: store?.logo };
}
