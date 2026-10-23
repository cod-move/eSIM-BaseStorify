import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { BrandGrid } from '@/features/browse/brand-tiles';
import { useBrands } from '@/features/browse/use-browse';

/** Every brand of the store, as on the website: `/brands`. A tap opens one. */
export default function BrandsScreen() {
  const t = useTranslations('browse');
  const brands = useBrands();

  return (
    <>
      <Stack.Screen options={{ title: t('brands') }} />
      {brands.isPending ? (
        <LoadingState />
      ) : brands.isError ? (
        <ErrorState error={brands.error} onRetry={() => void brands.refetch()} />
      ) : brands.data.length === 0 ? (
        <EmptyState icon="grid" title={t('brandsEmptyTitle')} body={t('brandsEmptyBody')} />
      ) : (
        <BrandGrid
          brands={brands.data}
          refreshing={brands.isRefetching && !brands.isFetchingNextPage}
          onRefresh={() => void brands.refetch()}
          onEndReached={() => {
            if (brands.hasNextPage && !brands.isFetchingNextPage) void brands.fetchNextPage();
          }}
          loadingMore={brands.isFetchingNextPage}
        />
      )}
    </>
  );
}
