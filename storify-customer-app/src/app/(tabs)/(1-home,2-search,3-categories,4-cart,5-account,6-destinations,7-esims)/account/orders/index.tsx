import { Stack, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { OrderList } from '@/features/orders/order-list';
import { useOrders } from '@/features/orders/use-orders';

/** The order history. Signed-in shoppers only; the store checks it too. */
export default function OrdersScreen() {
  const t = useTranslations('orders');
  const router = useRouter();
  const orders = useOrders();

  const body = () => {
    if (orders.isPending) return <LoadingState />;
    if (orders.isError) {
      return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;
    }
    if (orders.data.length === 0) {
      return (
        <EmptyState
          icon="package"
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={<Button label={t('startShopping')} onPress={() => router.navigate('/')} />}
        />
      );
    }
    return (
      <OrderList
        orders={orders.data}
        hasMore={orders.hasNextPage}
        loadingMore={orders.isFetchingNextPage}
        onMore={() => void orders.fetchNextPage()}
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {body()}
    </>
  );
}
