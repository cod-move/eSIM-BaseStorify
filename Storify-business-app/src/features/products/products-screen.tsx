import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { GroupedItem, ListEnd } from '@/components/ui/list-group';
import { RemovableChips, type RemovableChip } from '@/components/ui/removable-chips';
import { Screen, TabHeader, useBottomSpace } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { useCan } from '@/features/workspace/use-workspace';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { ProductFilterSheet } from './product-filter-sheet';
import {
  FILTER_KEYS,
  NO_PRODUCT_FILTER,
  chosenName,
  filterCount,
  isOn,
  queryOf,
  without,
  type ProductFilterKey,
  type ProductFilterValue,
} from './product-filters';
import { ProductRow } from './product-row';
import { useProductFilters, useProducts } from './use-products';

/**
 * Products: search by name or SKU, with the scanner and
 * the filters beside it (status, low stock, category, brand, collection, in a
 * sheet) and the filters that are on as chips under it, each with a cross;
 * "Add product" in the header; the products a page at a time, newest first.
 * A low-stock alert opens it on low stock.
 */

/** A chip's word for a filter whose option has not arrived yet. */
const CHIP_NAMES = {
  categoryId: 'category',
  brandId: 'brand',
  collectionId: 'collection',
} as const;

export function ProductsScreen() {
  const t = useTranslations('products');
  const tabs = useTranslations('tabs');
  const canCreate = useCan('CREATE_PRODUCTS');
  const bottom = useBottomSpace();
  // A low-stock alert opens the tab with `lowStock=true` (lib/links).
  const { lowStock } = useLocalSearchParams<{ lowStock?: string }>();
  const [filter, setFilter] = useState<ProductFilterValue>(() =>
    lowStock === 'true' ? { ...NO_PRODUCT_FILTER, lowStock: true } : NO_PRODUCT_FILTER
  );
  const [filtering, setFiltering] = useState(false);
  const options = useProductFilters();
  const [text, setText] = useState('');
  // Clearing the field shows every product at once; typing waits for a pause.
  const search = useDebouncedValue(text.trim());

  // An alert that arrives while the tab is open changes the param, and the filter follows.
  const [param, setParam] = useState(lowStock);
  if (lowStock !== param) {
    setParam(lowStock);
    if (lowStock === 'true') {
      // The alert's list whole: no search or other filter left from before narrows it.
      setFilter({ ...NO_PRODUCT_FILTER, lowStock: true });
      setText('');
    }
  }
  // Taken away once read, so the next alert changes it again.
  useEffect(() => {
    if (lowStock === 'true') router.setParams({ lowStock: undefined });
  }, [lowStock]);

  const products = useProducts(queryOf(filter, search));
  const { refetch } = products;
  useRefetchOnFocus(refetch);
  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  const active = filterCount(filter);
  const chips: RemovableChip<ProductFilterKey>[] = FILTER_KEYS.filter((key) =>
    isOn(filter, key)
  ).map((key) => {
    if (key === 'status') return { key, label: t(`filters.${filter.status ?? 'active'}`) };
    if (key === 'lowStock') return { key, label: t('filters.lowStock') };
    return {
      key,
      label: chosenName(options.data, key, filter[key]) ?? t(`filters.${CHIP_NAMES[key]}`),
    };
  });

  const items = products.data ?? [];
  let body;
  if (products.isPending) {
    body = <LoadingState shape="rows" leading />;
  } else if (products.isError && items.length === 0) {
    body = <ErrorState error={products.error} onRetry={() => void refetch()} />;
  } else if (items.length === 0) {
    body = (
      <EmptyList filter={filter} search={search} onClear={() => setFilter(NO_PRODUCT_FILTER)} />
    );
  } else {
    body = (
      <FlashList
        testID="product-list"
        data={items}
        extraData={items.length}
        keyExtractor={(product) => product.id}
        renderItem={({ item, index }) => (
          <GroupedItem index={index} count={items.length} divider="leading">
            <ProductRow
              product={item}
              onPress={() => router.push({ pathname: '/products/[id]', params: { id: item.id } })}
            />
          </GroupedItem>
        )}
        onEndReached={() => {
          if (products.hasNextPage && !products.isFetching && !products.isError) {
            void products.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottom }}
        ListFooterComponent={
          <ListEnd
            leading
            loading={products.isFetchingNextPage}
            error={products.isFetchNextPageError || products.isRefetchError ? products.error : null}
            onRetry={() =>
              void (products.isFetchNextPageError ? products.fetchNextPage() : refetch())
            }
          />
        }
      />
    );
  }

  return (
    <Screen
      header={
        <TabHeader
          title={tabs('products')}
          actions={
            canCreate ? (
              <Button
                label={t('editor.addProduct')}
                size="sm"
                variant="ink"
                onPress={() => router.push('/products/new')}
              />
            ) : undefined
          }
        />
      }>
      <View className="flex-row items-center gap-2 px-4">
        <SearchField
          label={t('search')}
          value={text}
          onChangeText={setText}
          maxLength={100}
          className="flex-1"
        />
        <IconButton icon="scan-barcode" label={t('scan')} onPress={() => router.push('/scanner')} />
        <IconButton
          icon="filter"
          label={active ? t('filters.buttonActive', { count: active }) : t('filters.button')}
          count={active}
          onPress={() => setFiltering(true)}
        />
      </View>
      {/* A plain view around the chips: in a browser a horizontal list grows to fill the screen. */}
      {chips.length ? (
        <View className="mt-3">
          <RemovableChips
            chips={chips}
            removeLabel={(label) => t('filters.remove', { filter: label })}
            onRemove={(key) => setFilter(without(filter, key))}
            clearLabel={t('filters.clear')}
            onClear={() => setFilter(NO_PRODUCT_FILTER)}
          />
        </View>
      ) : null}
      <View className="flex-1">{body}</View>
      <ProductFilterSheet
        visible={filtering}
        value={filter}
        onApply={setFilter}
        onClose={() => setFiltering(false)}
      />
    </Screen>
  );
}

function EmptyList({
  filter,
  search,
  onClear,
}: {
  filter: ProductFilterValue;
  search: string;
  onClear: () => void;
}) {
  const t = useTranslations('products.empty');
  const count = filterCount(filter);

  if (search) {
    return (
      <EmptyState
        icon="search"
        title={t('search', { search })}
        body={t('searchBody')}
        placement="top"
      />
    );
  }
  if (count === 0) {
    return <EmptyState icon="tag" title={t('all')} body={t('allBody')} placement="top" />;
  }
  if (count === 1 && filter.lowStock) {
    return (
      <EmptyState icon="boxes" title={t('lowStock')} body={t('lowStockBody')} placement="top" />
    );
  }
  if (count === 1 && filter.status) {
    return (
      <EmptyState icon="tag" title={t(filter.status)} body={t('statusBody')} placement="top" />
    );
  }
  return (
    <EmptyState
      icon="filter"
      title={t('filtered')}
      body={t('filteredBody')}
      placement="top"
      action={<Button label={t('clearFilters')} variant="secondary" size="sm" onPress={onClear} />}
    />
  );
}
