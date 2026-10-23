import { useInfiniteQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { getProducts } from '@/api/endpoints/products';
import { queryKeys } from '@/api/query-keys';
import { Button } from '@/components/ui/button';
import type { ProductGridBlock, ProductListQuery } from '@/contracts/mobile/shop/v1';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';
import { useLocale } from '@/i18n/locale-store';
import { dedupeById } from '@/lib/dedupe';

import { BlockTitle } from './block-title';

/**
 * The pages after the one the home screen came with. The block holds the first
 * page and the cursor that leads to the second; nothing is fetched until the
 * shopper asks for more. The cursor is part of the key, so a refreshed home
 * screen (a new first page) starts the list again.
 */
function useMoreProducts({ browse }: ProductGridBlock) {
  const locale = useLocale();
  const firstCursor = browse?.nextCursor ?? undefined;
  const query: ProductListQuery = { sort: 'NEWEST', limit: browse?.pageSize, cursor: firstCursor };

  const more = useInfiniteQuery({
    queryKey: queryKeys.products(locale, query),
    queryFn: ({ pageParam, signal }) =>
      getProducts(locale, { ...query, cursor: pageParam }, signal),
    initialPageParam: firstCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    enabled: false,
  });

  // Before the first request there are no pages to ask: the block's own cursor says.
  const hasMore = more.data === undefined ? firstCursor !== undefined : more.hasNextPage;
  return { more, hasMore };
}

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

/**
 * Products in two columns. When the store says there is more (`browse`), a
 * button adds the next page below the cards already shown; a card that came
 * on two pages shows once. A grid the store sized (`browse.maxProducts`)
 * stops there: the last page is trimmed to it and the button goes.
 */
export function ProductGrid({ block }: { block: ProductGridBlock }) {
  const t = useTranslations();
  const cardActions = useCardActions();
  const { more, hasMore: storeHasMore } = useMoreProducts(block);
  const loaded = dedupeById([...block.products, ...(more.data ?? [])]);
  const maxProducts = block.browse?.maxProducts;
  const products = maxProducts === undefined ? loaded : loaded.slice(0, maxProducts);
  const hasMore = storeHasMore && (maxProducts === undefined || loaded.length < maxProducts);
  if (products.length === 0) return null;

  return (
    <View className="gap-3">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View className="gap-3 px-4">
        {pairs(products).map((row) => (
          <View key={row[0]?.id} className="flex-row gap-2.5">
            {row.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                className="flex-1"
                {...cardActions(product)}
              />
            ))}
            {row.length === 1 ? <View className="flex-1" /> : null}
          </View>
        ))}
      </View>
      {hasMore ? (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          label={more.isFetchNextPageError ? t('common.retry') : t('common.viewAll')}
          {...(block.title && !more.isFetchNextPageError
            ? { accessibilityLabel: t('catalog.viewAllOf', { title: block.title }) }
            : {})}
          loading={more.isFetchingNextPage}
          onPress={() => void more.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
