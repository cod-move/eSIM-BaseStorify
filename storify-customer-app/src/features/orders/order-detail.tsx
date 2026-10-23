import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { StatusBadge, describeStatus } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Money, OrderAddress, OrderDetail } from '@/contracts/mobile/shop/v1';
import { ProductLink } from '@/features/catalog/product-link';
import { useOpenProduct } from '@/features/catalog/use-open-product';
import { useCapability } from '@/features/config/use-capability';

import { BuyAgain } from './buy-again';
import { CancelOrder } from './cancel-order';
import { LineReview } from './line-review';
import { ReceiptButton } from './receipt-button';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-xl bg-surface p-4">
      <Text variant="subheading">{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={strong ? 'font-semibold' : 'text-muted'}>{label}</Text>
      {typeof value === 'string' ? (
        <Text variant={strong ? 'price' : 'body'} className="shrink text-end">
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

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

/** The order detail: its lines, totals, payment, delivery, and what may be done with it. */
export function OrderDetailView({ order }: { order: OrderDetail }) {
  const t = useTranslations('orders');
  const tReturns = useTranslations('returns');
  const returnsOn = useCapability('orders.returns');
  const format = useFormatter();
  const router = useRouter();
  const openProduct = useOpenProduct();
  const tabBar = useTabBarHeight();
  const date = (at: string) => format.dateTime(new Date(at), { dateStyle: 'medium' });
  const { totals } = order;
  const stopped = order.cancelledAt !== undefined;
  // Zero rows say nothing; the amount is only looked at, never worked out.
  const shown = (money: Money | undefined): money is Money =>
    money !== undefined && money.amount !== 0;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}>
      <View className="gap-3 rounded-xl bg-surface p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text variant="subheading">{t('number', { number: order.number })}</Text>
            <Text variant="caption">{t('placedOn', { date: date(order.placedAt) })}</Text>
            {order.cancelledAt ? (
              <Text variant="caption">{t('cancelledOn', { date: date(order.cancelledAt) })}</Text>
            ) : null}
          </View>
          <StatusBadge status={order.status} />
        </View>
        {stopped ? null : (
          <Button
            label={t('trackOrder')}
            onPress={() =>
              router.push({ pathname: '/account/orders/[id]/tracking', params: { id: order.id } })
            }
          />
        )}
      </View>

      <Section title={t('itemsHeading')}>
        {order.lines.map((line, index) => (
          <View key={line.index} className="gap-3">
            {index > 0 ? <Divider /> : null}
            {/* The product it was bought as: to buy it again, or review it once delivered. */}
            <ProductLink product={line} className="flex-row items-center gap-4">
              <View className="size-[70px] items-center justify-center rounded-lg bg-surface-alt">
                <AppImage image={line.image} size="thumb" className="size-[58px] rounded-md" />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="product" numberOfLines={2}>
                  {line.name}
                </Text>
                <Text variant="caption">{t('quantity', { count: line.quantity })}</Text>
                <Text variant="price">{line.lineTotal.formatted}</Text>
              </View>
              <Icon name="chevron-right" size={20} directional />
            </ProductLink>
            {stopped ? null : (
              <LineReview line={line} onWrite={() => openProduct(line, 'review')} />
            )}
          </View>
        ))}
      </Section>

      <Section title={t('summaryHeading')}>
        <Row label={t('subtotal')} value={totals.subtotal.formatted} />
        <Row label={t('shipping')} value={totals.shipping.formatted} />
        {shown(totals.tax) ? <Row label={t('tax')} value={totals.tax.formatted} /> : null}
        {shown(totals.discount) ? (
          <Row label={t('discount')} value={totals.discount.formatted} />
        ) : null}
        {shown(totals.storeCredit) ? (
          <Row label={t('storeCredit')} value={totals.storeCredit.formatted} />
        ) : null}
        <Divider />
        <Row label={t('total')} value={totals.total.formatted} strong />
        {shown(totals.refunded) ? (
          <Row label={t('refunded')} value={totals.refunded.formatted} />
        ) : null}
      </Section>

      <Section title={t('paymentHeading')}>
        <Row
          label={t('paymentMethod')}
          value={
            order.paymentMethod === 'cod'
              ? t('cashOnDelivery')
              : describeStatus(order.paymentMethod).text
          }
        />
        <Row label={t('paymentStatus')} value={<StatusBadge status={order.paymentStatus} />} />
      </Section>

      {order.shippingAddress || order.pickup || order.shippingMethod ? (
        <Section title={t('deliveryHeading')}>
          {order.shippingMethod ? (
            <Row label={t('shippingMethod')} value={order.shippingMethod} />
          ) : null}
          {order.shippingAddress ? (
            <View className="gap-0.5">
              <Text variant="caption">{t('shippingAddress')}</Text>
              {addressLines(order.shippingAddress).map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </View>
          ) : null}
          {order.pickup ? (
            <View className="gap-0.5">
              <Text variant="caption">{t('pickupHeading')}</Text>
              {order.pickup.locationName ? (
                <Text className="font-semibold">{order.pickup.locationName}</Text>
              ) : null}
              <Text>{order.pickup.address}</Text>
              <Text className="text-muted">
                {t('pickupWindow', {
                  start: format.dateTime(new Date(order.pickup.startAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                  end: format.dateTime(new Date(order.pickup.endAt), { timeStyle: 'short' }),
                })}
              </Text>
              {order.pickup.instructions ? <Text>{order.pickup.instructions}</Text> : null}
            </View>
          ) : null}
          {order.billingAddress ? (
            <View className="gap-0.5">
              <Text variant="caption">{t('billingAddress')}</Text>
              {addressLines(order.billingAddress).map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </View>
          ) : null}
        </Section>
      ) : null}

      {order.note ? (
        <Section title={t('noteHeading')}>
          <Text>{order.note}</Text>
        </Section>
      ) : null}

      <BuyAgain lines={order.lines} />
      <ReceiptButton source={{ orderId: order.id }} />
      {returnsOn && order.canReturn ? (
        <Button
          variant="secondary"
          icon="return"
          label={tReturns('returnItems')}
          onPress={() =>
            router.push({
              pathname: '/account/returns/request/[orderId]',
              params: { orderId: order.id },
            })
          }
        />
      ) : null}
      {returnsOn && !order.canReturn && order.returnBlockedMessage ? (
        <Text className="px-1 text-muted">{order.returnBlockedMessage}</Text>
      ) : null}
      {order.canCancel ? <CancelOrder id={order.id} /> : null}
    </ScrollView>
  );
}
