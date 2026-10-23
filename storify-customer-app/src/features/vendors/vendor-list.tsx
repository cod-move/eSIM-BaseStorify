import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import type { VendorSummary } from '@/contracts/mobile/shop/v1';

import { VendorCard } from './vendor-card';

type VendorListProps = {
  vendors: VendorSummary[];
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  loadingMore: boolean;
};

const GAP = 16;

/** Every seller as a card, one under the other, with pull to refresh; the bottom clears the tab bar. */
export function VendorList({
  vendors,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore,
}: VendorListProps) {
  const bottom = useTabBarHeight();
  const { width } = useWindowDimensions();

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={vendors}
        keyExtractor={(vendor) => vendor.id}
        renderItem={({ item }) => <VendorCard vendor={item} width={width - GAP * 2} />}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        contentContainerStyle={{ padding: GAP, paddingBottom: bottom + GAP }}
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
