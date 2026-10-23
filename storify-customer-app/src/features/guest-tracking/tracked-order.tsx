import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { Text } from '@/components/ui/text';
import type { OrderAddress, OrderDetail } from '@/contracts/mobile/shop/v1';
import { parcelsOf } from '@/features/orders/parcels';
import { ParcelCard } from '@/features/orders/tracking-sheet';

function addressLines(address: OrderAddress): string[] {
  const place = [address.city, address.state, address.postalCode].filter(Boolean).join(', ');
  return [
    address.name,
    address.street,
    address.apartment,
    place,
    address.country,
    address.phone,
  ].filter((line): line is string => Boolean(line));
}

type TrackedOrderProps = { order: OrderDetail; onTrackAnother: () => void };

/** A guest's order as the store shows it: read-only, its parcels and their steps. */
export function TrackedOrder({ order, onTrackAnother }: TrackedOrderProps) {
  const t = useTranslations('trackOrder');
  const tOrders = useTranslations('orders');
  const format = useFormatter();

  return (
    <View className="gap-5">
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="subheading" className="flex-1">
            {tOrders('number', { number: order.number })}
          </Text>
          <StatusBadge status={order.status} />
        </View>
        <Text variant="caption">
          {tOrders('placedOn', {
            date: format.dateTime(new Date(order.placedAt), { dateStyle: 'medium' }),
          })}
        </Text>
        <Text variant="caption">{t('readOnly')}</Text>
      </View>

      {parcelsOf(order).map((parcel, index) => (
        <ParcelCard key={index} parcel={parcel} />
      ))}

      <View className="gap-1 rounded-3xl bg-surface px-4 py-6">
        <View className="min-h-11 flex-row items-center justify-between gap-3">
          <Text className="text-muted">{tOrders('total')}</Text>
          <Text variant="price">{order.totals.total.formatted}</Text>
        </View>
        {order.shippingAddress ? (
          <>
            <Divider />
            <View className="gap-0.5 pt-3">
              <Text variant="caption">{tOrders('shippingAddress')}</Text>
              {addressLines(order.shippingAddress).map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <Button variant="outline" label={t('trackAnother')} onPress={onTrackAnother} />
    </View>
  );
}
