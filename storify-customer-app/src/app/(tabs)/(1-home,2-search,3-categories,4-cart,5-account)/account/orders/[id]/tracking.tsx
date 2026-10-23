import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { parcelsOf } from '@/features/orders/parcels';
import { OrderSheet, ParcelCard } from '@/features/orders/tracking-sheet';
import { useOrder } from '@/features/orders/use-orders';

/** Track order: a sheet with one card per parcel. */
export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('orders');
  const order = useOrder(id);

  const body = () => {
    if (order.isPending) return <LoadingState />;
    if (order.isError) {
      return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
    }
    return (
      <View className="gap-4">
        {parcelsOf(order.data).map((parcel, index) => (
          <ParcelCard key={index} parcel={parcel} />
        ))}
      </View>
    );
  };

  return (
    <OrderSheet id={id} title={t('trackTitle')}>
      {body()}
    </OrderSheet>
  );
}
