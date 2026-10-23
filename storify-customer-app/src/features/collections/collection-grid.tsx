import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, View } from 'react-native';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import type { CollectionSummary } from '@/contracts/mobile/shop/v1';

import { CollectionCard } from './collection-card';

type CollectionGridProps = {
  collections: CollectionSummary[];
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  loadingMore: boolean;
};

/** Every collection in two columns, with pull to refresh; the bottom clears the tab bar. */
export function CollectionGrid({
  collections,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore,
}: CollectionGridProps) {
  const bottom = useTabBarHeight();

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={collections}
        numColumns={2}
        keyExtractor={(collection) => collection.id}
        renderItem={({ item }) => <CollectionCard collection={item} className="m-2 flex-1" />}
        contentContainerStyle={{ padding: 8, paddingBottom: bottom + 16 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListFooterComponent={
          loadingMore ? (
            <View className="p-4">
              <ActivityIndicator colorClassName="accent-muted" />
            </View>
          ) : null
        }
      />
    </View>
  );
}
