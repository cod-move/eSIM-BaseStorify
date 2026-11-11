import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { OrderDetailView } from '@/features/orders/order-detail';
import { useOrder } from '@/features/orders/use-orders';

/** The order detail. Its title is the order's number once it has arrived. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('orders');
  const order = useOrder(id);

  const body = () => {
    if (order.isPending) return <LoadingState />;
    if (order.isError) {
      return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
    }
    return <OrderDetailView order={order.data} />;
  };

  return (
    <>
      <Stack.Screen
        options={{ title: order.data ? t('detailTitle', { number: order.data.number }) : '' }}
      />
      {body()}
    </>
  );
}
