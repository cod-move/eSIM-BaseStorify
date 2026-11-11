import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { CollectionGrid } from '@/features/collections/collection-grid';
import { useCollections } from '@/features/collections/use-collections';

/** Every collection of the store, as on the website: `/collections`. A tap opens one. */
export default function CollectionsScreen() {
  const t = useTranslations('collections');
  const collections = useCollections();

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {collections.isPending ? (
        <LoadingState />
      ) : collections.isError ? (
        <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
      ) : collections.data.length === 0 ? (
        <EmptyState icon="grid" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <CollectionGrid
          collections={collections.data}
          refreshing={collections.isRefetching && !collections.isFetchingNextPage}
          onRefresh={() => void collections.refetch()}
          onEndReached={() => {
            if (collections.hasNextPage && !collections.isFetchingNextPage) {
              void collections.fetchNextPage();
            }
          }}
          loadingMore={collections.isFetchingNextPage}
        />
      )}
    </>
  );
}
