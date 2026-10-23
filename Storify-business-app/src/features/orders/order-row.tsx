import { router } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Price } from '@/components/ui/price';
import { ListRow } from '@/components/ui/rows';
import { StatusChip } from '@/components/ui/status-chip';
import type { OrderListItem } from '@/contracts/mobile/biz/v1';
import { OrderStatusChip, PaymentStatusChip, useStatusLabel } from '@/features/status/status-chip';
import { knownStatus } from '@/features/status/status-tone';

import { useOrderWords } from './order-words';

/** A payment is worth a chip in the list unless it is simply paid. */
export function paymentNeedsALook(paymentStatus: string): boolean {
  return knownStatus('payment', paymentStatus) !== 'paid';
}

/** The small "Pre-order" chip, unless the status chip already says it. */
export function showsPreOrderChip(order: { preOrder: boolean; status: string }): boolean {
  return order.preOrder && knownStatus('order', order.status) !== 'preordered';
}

type OrderRowProps = {
  order: OrderListItem;
};

/**
 * An order in the list: the number and the total; the
 * customer, or "Walk-in sale"; the date and the items, with the status at the
 * end, and the payment when it needs a look. For a seller, every figure is
 * their own part of the order. Tapping it opens the order. Drawn in the list's
 * group by `GroupedItem`.
 */
export function OrderRow({ order }: OrderRowProps) {
  const t = useTranslations('orders');
  const words = useOrderWords();
  const label = useStatusLabel();
  const customer = order.customerName ?? t('walkIn');
  const payment = paymentNeedsALook(order.paymentStatus);
  const preOrder = showsPreOrderChip(order);

  const spoken = [
    t('rowLabel', { number: order.number }),
    customer,
    order.total.formatted,
    label('order', order.status),
    payment ? label('payment', order.paymentStatus) : null,
    preOrder ? t('preOrder') : null,
  ];

  return (
    <ListRow
      title={words.number(order.number)}
      titleEnd={<Price money={order.total} />}
      subtitle={customer}
      meta={t('rowMeta', {
        date: words.shortDate(order.placedAt),
        items: t('items', { count: order.itemCount }),
      })}
      metaEnd={
        <>
          {preOrder ? <StatusChip tone="neutral" label={t('preOrder')} /> : null}
          {payment ? <PaymentStatusChip status={order.paymentStatus} /> : null}
          <OrderStatusChip status={order.status} />
        </>
      }
      accessibilityLabel={spoken.filter(Boolean).join(', ')}
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
    />
  );
}
