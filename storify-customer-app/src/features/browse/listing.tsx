import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { RevealCard, useGridReveal } from '@/components/ui/motion';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';
import { SearchPanel, useSearchPanel } from '@/features/search/search-panel';
import type { ListingQuery } from '@/lib/listing-query';

import { BrandTiles } from './brand-tiles';
import { FilterSheet, type ListingChoice } from './filter-sheet';
import { filterCount, useBrandTiles, useFacets, useListing } from './use-browse';

type ListingProps = {
  query: ListingQuery;
  /** Open the sheet at once: a link to `/products?sheet=sort`. */
  sheet?: 'filter' | 'sort';
};

/** The words a choice leaves in the address. The website's own words give way to the app's. */
function wordsOf(query: Pick<ListingQuery, 'q'> & ListingChoice) {
  return {
    search: undefined,
    sortBy: undefined,
    stock: undefined,
    sheet: undefined,
    q: query.q,
    sort: query.sort,
    brand: query.brand,
    inStock: query.inStock ? 'true' : undefined,
    onSale: query.onSale ? 'true' : undefined,
    minPrice: query.minPrice?.toString(),
    maxPrice: query.maxPrice?.toString(),
  };
}

/**
 * A list of products: the search field with the filter button, the
 * brand tiles, and the two-column grid that loads more as the shopper scrolls.
 * Every choice is written into the address, so the list reloads from it and a
 * shared link opens the same list.
 */
export function Listing({ query, sheet }: ListingProps) {
  const t = useTranslations('browse');
  const router = useRouter();
  const bottom = useTabBarHeight();
  const cardActions = useCardActions();
  const list = useListing(query);
  const reveal = useGridReveal(list.isSuccess, 2);
  const facets = useFacets(query);
  const brands = useBrandTiles(query);
  const [typed, setTyped] = useState(query.q ?? '');
  const [open, setOpen] = useState<'filter' | 'sort' | undefined>(sheet);
  const pageRef = useRef<View>(null);
  const fieldRef = useRef<View>(null);
  const panel = useSearchPanel(typed, { pageRef, fieldRef });

  const choose = (choice: Partial<ListingChoice> & Pick<ListingQuery, 'q'>) =>
    router.setParams(wordsOf({ ...query, ...choice }));
  const clearFilters = () =>
    choose({
      brand: undefined,
      inStock: undefined,
      onSale: undefined,
      minPrice: undefined,
      maxPrice: undefined,
    });
  const search = (text: string) => {
    panel.close();
    choose({ q: text.trim() || undefined });
  };

  // The grid pads its sides by 8; the header stands on the page's 16 pt gutter.
  const header = (
    <View className="-mx-2">
      <View ref={fieldRef} className="flex-row items-center gap-3 px-4 pt-2">
        <SearchField
          className="flex-1"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          value={typed}
          onChangeText={setTyped}
          onSubmit={search}
          onFocus={panel.onFocus}
          onBlur={panel.onBlur}
        />
        <IconButton
          icon="filter"
          variant="outlined"
          label={t('filterLabel', { count: filterCount(query) })}
          count={filterCount(query)}
          onPress={() => setOpen('filter')}
        />
      </View>
      <BrandTiles brands={brands} chosen={query.brand} onChoose={(brand) => choose({ brand })} />
    </View>
  );

  return (
    <View ref={pageRef} className="flex-1 bg-background">
      {list.isPending ? (
        <>
          {header}
          <LoadingState />
        </>
      ) : list.isError ? (
        <>
          {header}
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </>
      ) : (
        <FlashList
          data={list.data.cards}
          numColumns={2}
          {...reveal.list}
          keyExtractor={(product) => product.id}
          renderItem={({ item, index }) => (
            <RevealCard {...reveal.card(item.id, index)} className="flex-1">
              <ProductCard product={item} className="m-2 flex-1" {...cardActions(item)} />
            </RevealCard>
          )}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: bottom + 16 }}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title={t('emptyTitle')}
              body={t('emptyBody')}
              action={
                filterCount(query) > 0 ? (
                  <Button variant="outline" label={t('clearFilters')} onPress={clearFilters} />
                ) : undefined
              }
            />
          }
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <View className="p-4">
                <ActivityIndicator colorClassName="accent-muted" />
              </View>
            ) : null
          }
        />
      )}
      {panel.open ? (
        <SearchPanel control={panel} scope={query} onViewAll={() => search(typed)} />
      ) : null}
      <FilterSheet
        visible={open !== undefined}
        page={open ?? 'filter'}
        query={query}
        brands={brands}
        priceRange={facets.data?.priceRange}
        onClose={() => setOpen(undefined)}
        onApply={(choice) => {
          setOpen(undefined);
          choose(choice);
        }}
      />
    </View>
  );
}
