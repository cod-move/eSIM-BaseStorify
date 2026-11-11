import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Listing } from '@/features/browse/listing';
import { BrandHeader } from '@/features/search/listing-header';
import { isNotFound, useBrand } from '@/features/search/use-search';
import { SharePageButton } from '@/features/vendors/share-page-button';
import { listingQueryFromWords } from '@/lib/listing-query';

/** A brand's page, as on the website: `/brands/{slug}`. Its header, then its products. */
export default function BrandScreen() {
  const t = useTranslations('search');
  const params = useLocalSearchParams<{ slug: string }>();
  const { slug } = params;
  const brand = useBrand(slug);
  const shown = brand.data;
  // The brand's products in the browse listing; its filters ride in the address.
  const query = { ...listingQueryFromWords(params), brand: slug };

  return (
    <>
      <Stack.Screen
        options={{
          title: shown?.name ?? '',
          headerRight: shown
            ? () => (
                <SharePageButton
                  path={`/brands/${encodeURIComponent(shown.slug)}`}
                  title={shown.name}
                />
              )
            : undefined,
        }}
      />
      {brand.isPending ? (
        <LoadingState />
      ) : brand.isError ? (
        isNotFound(brand.error) ? (
          <EmptyState icon="search" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={brand.error} onRetry={() => void brand.refetch()} />
        )
      ) : (
        <View className="flex-1 bg-background">
          <BrandHeader brand={brand.data} />
          <Listing query={query} />
        </View>
      )}
    </>
  );
}
