import { useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { getBrands } from '@/api/endpoints/brands';
import { getProductFacets, getProducts } from '@/api/endpoints/products';
import { queryKeys } from '@/api/query-keys';
import {
  LIST_MAX_LIMIT,
  type ImageSet,
  type ProductCard,
  type ProductList,
  type ProductSort,
} from '@/contracts/mobile/shop/v1';
import { findCategory, useCategories } from '@/features/categories/use-categories';
import { useLocale } from '@/i18n/locale-store';
import type { ListingQuery } from '@/lib/listing-query';

const PAGE_SIZE = 20;

/**
 * The cards of every page loaded so far, each product once. A sponsored card
 * can come back on a later page among the organic results; the first one stays.
 */
export function uniqueCards(pages: Pick<ProductList, 'items'>[]): ProductCard[] {
  const seen = new Set<string>();
  return pages.flatMap((page) =>
    page.items.filter((card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    })
  );
}

/** A list of products that grows as the shopper scrolls, with the total the store reports. */
export function useListing(query: ListingQuery) {
  const locale = useLocale();

  return useInfiniteQuery({
    queryKey: queryKeys.products(locale, query),
    queryFn: ({ pageParam, signal }) =>
      getProducts(locale, { ...query, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => ({
      cards: uniqueCards(data.pages),
      total: data.pages[0]?.total ?? 0,
    }),
  });
}

/** What the listing can be narrowed by, for its category or seller. */
export function useFacets(query: ListingQuery) {
  const locale = useLocale();
  const scope = { category: query.category, vendor: query.vendor };

  return useQuery({
    queryKey: queryKeys.productFacets(locale, scope),
    queryFn: ({ signal }) => getProductFacets(locale, scope, signal),
  });
}

/** Every brand of the store, a page at a time through the API's cursor. */
export function useBrands(options: { enabled?: boolean } = {}) {
  const locale = useLocale();

  return useInfiniteQuery({
    queryKey: queryKeys.brands(locale, { limit: LIST_MAX_LIMIT }),
    queryFn: ({ pageParam, signal }) =>
      getBrands(locale, { cursor: pageParam, limit: LIST_MAX_LIMIT }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    enabled: options.enabled,
  });
}

export type BrandTile = { slug: string; name: string; logo?: ImageSet };

/**
 * The facets' brands, each with its logo from the store's brand list when it has one.
 * The list is read to its last page: a brand on the third page has its logo too.
 */
export function useBrandTiles(query: ListingQuery): BrandTile[] {
  const facets = useFacets(query);
  const logos = useBrands({ enabled: (facets.data?.brands.length ?? 0) > 0 });
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = logos;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const logoOf = new Map(logos.data?.map((brand) => [brand.slug, brand.logo]));
  return (facets.data?.brands ?? []).map((brand) => ({ ...brand, logo: logoOf.get(brand.slug) }));
}

/** The orders a shopper may choose. Relevance only means something for a search. */
export function sortsFor(query: ListingQuery): ProductSort[] {
  const orders: ProductSort[] = ['POPULAR', 'NEWEST', 'PRICE_ASC', 'PRICE_DESC', 'RATING'];
  return query.q ? ['RELEVANCE', ...orders] : orders;
}

/** The order the store uses when none is asked for. */
export function defaultSort(query: ListingQuery): ProductSort {
  return query.q ? 'RELEVANCE' : 'POPULAR';
}

/** How many filters are on, for the filter button's count. The order is not a filter. */
export function filterCount(query: ListingQuery): number {
  return [
    query.brand,
    query.inStock,
    query.onSale,
    query.minPrice !== undefined || query.maxPrice !== undefined || undefined,
  ].filter(Boolean).length;
}

/**
 * What the header says is listed: the category, the brand, the
 * collection, or the search; the shop as a whole when nothing narrows it.
 */
export function useListingTitle(query: ListingQuery): string {
  const t = useTranslations('browse');
  // The tree is one cached answer; a listing without a category looks nothing up in it.
  const tree = useCategories();
  const facets = useFacets(query);
  const brands = useBrandTiles(query);

  if (query.q) return t('searchTitle', { q: query.q });
  const category =
    query.category && tree.data ? findCategory(tree.data, query.category) : undefined;
  const name =
    category?.name ??
    brands.find((brand) => brand.slug === query.brand)?.name ??
    facets.data?.collections.find((collection) => collection.slug === query.collection)?.name;
  return name ?? t('title');
}
