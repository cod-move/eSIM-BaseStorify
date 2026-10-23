import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Reveal, useReveal } from '@/components/ui/motion';
import type { OrderSummary } from '@/contracts/mobile/shop/v1';

import { OrderCard } from './order-card';

type OrderListProps = {
  orders: OrderSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
};

/** The order history: one card per order, 12 pt apart, more loading as the shopper scrolls. */
export function OrderList({ orders, hasMore, loadingMore, onMore }: OrderListProps) {
  const router = useRouter();
  const tabBar = useTabBarHeight();
  const reveal = useReveal();

  return (
    <FlatList
      data={orders}
      keyExtractor={(order) => order.id}
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !loadingMore) onMore();
      }}
      ListFooterComponent={
        loadingMore ? (
          <View className="items-center py-4">
            <ActivityIndicator />
          </View>
        ) : null
      }
      renderItem={({ item, index }) => (
        <Reveal entering={reveal(index)}>
          <OrderCard
            order={item}
            onView={() =>
              router.push({ pathname: '/account/orders/[id]', params: { id: item.id } })
            }
            onTrack={() =>
              router.push({ pathname: '/account/orders/[id]/tracking', params: { id: item.id } })
            }
            onReturn={() =>
              router.push({
                pathname: '/account/returns/request/[orderId]',
                params: { orderId: item.id },
              })
            }
          />
        </Reveal>
      )}
    />
  );
}
