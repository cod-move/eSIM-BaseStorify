import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Listing } from '@/features/browse/listing';
import { listingQueryFromWords } from '@/lib/listing-query';
import { CollectionHeader } from '@/features/search/listing-header';
import { isNotFound, useCollection } from '@/features/search/use-search';

/**
 * A collection's page, as on the website: `/collections/{slug}`. Its header, then its products in
 * the same list the category and brand pages use: cards with the cart button and the heart,
 * sorting and filters.
 */
export default function CollectionScreen() {
  const t = useTranslations('search');
  const params = useLocalSearchParams<{ slug: string; sheet?: string }>();
  const { slug } = params;
  const collection = useCollection(slug);
  // The page lists this collection; the shopper's search, sort and filters ride in the address.
  const query = { ...listingQueryFromWords(params), collection: slug };
  const sheet = params.sheet === 'filter' || params.sheet === 'sort' ? params.sheet : undefined;

  return (
    <>
      {/* Over a collection's cover the header is transparent and has no title: the cover holds it. */}
      <Stack.Screen
        options={
          collection.data?.image
            ? { title: '', headerTransparent: true }
            : { title: collection.data?.title ?? '', headerTransparent: false }
        }
      />
      {collection.isPending ? (
        <LoadingState />
      ) : collection.isError ? (
        isNotFound(collection.error) ? (
          <EmptyState icon="search" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={collection.error} onRetry={() => void collection.refetch()} />
        )
      ) : (
        <View className="flex-1 bg-background">
          <CollectionHeader collection={collection.data} />
          <Listing key={JSON.stringify(query.q ?? '')} query={query} sheet={sheet} />
        </View>
      )}
    </>
  );
}
