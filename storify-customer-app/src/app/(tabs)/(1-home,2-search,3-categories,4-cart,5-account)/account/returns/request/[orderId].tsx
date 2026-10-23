import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { useOrder } from '@/features/orders/use-orders';
import { ReturnRequest } from '@/features/returns/request-return';

/** "Request a return" for one of the shopper's orders. */
export default function RequestReturnScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const t = useTranslations('returns');
  const order = useOrder(orderId);

  const body = () => {
    if (order.isPending) return <LoadingState />;
    if (order.isError) {
      return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
    }
    return <ReturnRequest order={order.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('requestTitle') }} />
      {body()}
    </>
  );
}
