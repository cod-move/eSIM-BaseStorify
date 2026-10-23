import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { OrderSummary } from '@/contracts/mobile/shop/v1';
import { useCapability } from '@/features/config/use-capability';

import { isActiveOrder } from './active-orders';

type OrderCardProps = {
  order: OrderSummary;
  onView: () => void;
  onTrack: () => void;
  /** Opens "Request a return" for this order. */
  onReturn: () => void;
};

/**
 * One order in the history: its number
 * and its one status, when it was placed, how many items and what it cost. The
 * sellers' own statuses are on the order's page. An order still on its way
 * (not delivered, cancelled or refunded) offers "Track Order"; a finished one,
 * "View Order". Beside it, "Request return" when the store says the order can
 * be returned now (`canReturn`); why one cannot is on the order's page.
 */
export function OrderCard({ order, onView, onTrack, onReturn }: OrderCardProps) {
  const t = useTranslations('orders');
  const returnsOn = useCapability('orders.returns');
  const format = useFormatter();
  const date = format.dateTime(new Date(order.placedAt), { dateStyle: 'medium' });
  const items = t('items', { count: order.itemCount });
  const trackable = isActiveOrder(order);
  const returnable = returnsOn && order.canReturn === true;
  // Two buttons share the row equally; a narrower pill keeps both labels whole.
  const width = returnable ? 'flex-1 px-3' : 'flex-1';

  return (
    <View className="gap-3 rounded-xl bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-0.5">
          <Text variant="subheading">{t('number', { number: order.number })}</Text>
          <Text variant="caption">{t('placedOn', { date })}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-muted">{items}</Text>
        <View className="flex-row items-baseline gap-2">
          <Text variant="caption">{t('total')}</Text>
          <Text variant="price">{order.total.formatted}</Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        {trackable ? (
          <Button label={t('trackOrder')} className={width} onPress={onTrack} />
        ) : (
          <Button label={t('viewOrder')} variant="secondary" className={width} onPress={onView} />
        )}
        {returnable ? (
          <Button
            label={t('requestReturn')}
            variant="outline"
            icon="return"
            className={width}
            onPress={onReturn}
          />
        ) : null}
      </View>
    </View>
  );
}
