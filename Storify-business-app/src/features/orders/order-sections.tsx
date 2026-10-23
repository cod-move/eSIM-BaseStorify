import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { IconButton } from '@/components/ui/icon-button';
import { IconCircle } from '@/components/ui/icon-circle';
import type { IconName } from '@/components/ui/icon';
import { Price } from '@/components/ui/price';
import { ActionRow, ListRow, RowGroup, SectionLabel, ValueRow } from '@/components/ui/rows';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type {
  Money,
  OrderAddress,
  OrderConsignment,
  OrderDetail,
  OrderLine,
  OrderTimelineEvent,
} from '@/contracts/mobile/biz/v1';
import { OrderStatusChip, PaymentStatusChip, useStatusLabel } from '@/features/status/status-chip';
import { useOpenPage } from '@/features/web/use-open-page';

import { showsPreOrderChip } from './order-row';
import { useOrderWords } from './order-words';

/**
 * The parts of an order's page: a summary, then groups
 * of facts, the lines under the shipment that carries them, and the timeline
 * last. Each shows what the store sent and nothing it left out.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <SectionLabel title={title} />
      {children}
    </View>
  );
}

/** The statuses, the total, when and where it was placed; why it was cancelled. */
export function OrderSummary({ order }: { order: OrderDetail }) {
  const t = useTranslations('orders');
  const words = useOrderWords();
  const placed = words.longDate(order.placedAt);
  const preOrder = showsPreOrderChip({
    preOrder: order.lines.some((line) => line.preOrder),
    status: order.status,
  });

  return (
    <View className="gap-3 rounded-xl bg-surface p-4">
      <View className="flex-row flex-wrap gap-2">
        <OrderStatusChip status={order.status} />
        <PaymentStatusChip status={order.paymentStatus} />
        {preOrder ? <StatusChip tone="neutral" label={t('preOrder')} /> : null}
      </View>
      <View accessible accessibilityLabel={`${t('order.total')}, ${order.totals.total.formatted}`}>
        <Text variant="meta">{t('order.total')}</Text>
        <Price money={order.totals.total} variant="price-large" />
      </View>
      <Text variant="meta">
        {order.channel
          ? t('order.placedVia', { date: placed, channel: words.channel(order.channel) })
          : t('order.placed', { date: placed })}
      </Text>
      {order.cancelledAt ? (
        <Text variant="meta">
          {t('order.cancelledOn', { date: words.longDate(order.cancelledAt) })}
        </Text>
      ) : null}
      {order.cancelReason ? (
        <View className="gap-1 rounded-md bg-surface-alt px-3 py-2">
          <Text variant="section">{t('order.cancelReason')}</Text>
          <Text variant="long">{order.cancelReason}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Who placed it, as far as the operator may see them; a sale at the counter
 * names nobody. `onOpenProfile` adds "View profile" (the store named the
 * customer, and the operator may see customers).
 */
export function CustomerSection({
  customer,
  onOpenProfile,
}: {
  customer: OrderDetail['customer'];
  onOpenProfile?: () => void;
}) {
  const t = useTranslations('orders.order');
  const known = Boolean(customer.name || customer.email || customer.phone);

  return (
    <Section title={t('customer')}>
      <RowGroup>
        {known ? (
          [
            customer.name ? <ValueRow key="name" label={t('name')} value={customer.name} /> : null,
            customer.email ? (
              <ValueRow key="email" label={t('email')} value={customer.email} />
            ) : null,
            customer.phone ? (
              <ValueRow key="phone" label={t('phone')} value={customer.phone} />
            ) : null,
            onOpenProfile ? (
              <ActionRow
                key="profile"
                icon="user"
                title={t('viewProfile')}
                onPress={onOpenProfile}
              />
            ) : null,
          ]
        ) : (
          <View className="px-4 py-3">
            <Text className="text-muted">{t('walkIn')}</Text>
          </View>
        )}
      </RowGroup>
    </Section>
  );
}

type ShipmentsSectionProps = {
  order: OrderDetail;
  /**
   * Offered on a shipment the store may call off alone (one seller's part of
   * a split order); left out where the operator cannot.
   */
  onCancelPart?: (consignment: OrderConsignment) => void;
  /** A step is on its way: the other steps wait. */
  busy: boolean;
};

/**
 * The lines, under the shipment (consignment) that carries each: one per
 * seller, with its status, tracking and dates. A seller sees only their own.
 * An order of one shipment from a store without sellers is just "Items".
 */
export function ShipmentsSection({ order, onCancelPart, busy }: ShipmentsSectionProps) {
  const t = useTranslations('orders.order');
  const lineAt = new Map(order.lines.map((line) => [line.index, line]));
  const carried = new Set(order.consignments.flatMap((consignment) => consignment.lineIndexes));
  const loose = order.lines.filter((line) => !carried.has(line.index));
  const named =
    order.consignments.length > 1 ||
    order.consignments.some((consignment) => consignment.vendorName);

  return (
    <Section title={named ? t('shipments') : t('items')}>
      <View className="gap-3">
        {order.consignments.map((consignment) => (
          <Shipment
            key={consignment.id}
            consignment={consignment}
            lines={consignment.lineIndexes.flatMap((index) => lineAt.get(index) ?? [])}
            named={named}
            showTotal={order.consignments.length > 1}
            onCancel={
              onCancelPart && consignment.actions.includes('cancel')
                ? () => onCancelPart(consignment)
                : undefined
            }
            busy={busy}
          />
        ))}
        {loose.length > 0 ? (
          <RowGroup divider="leading">
            {loose.map((line) => (
              <LineRow key={line.index} line={line} />
            ))}
          </RowGroup>
        ) : null}
      </View>
    </Section>
  );
}

type ShipmentProps = {
  consignment: OrderConsignment;
  lines: OrderLine[];
  /** With the seller's name and its own status at the top. */
  named: boolean;
  showTotal: boolean;
  onCancel?: () => void;
  busy: boolean;
};

function Shipment({ consignment, lines, named, showTotal, onCancel, busy }: ShipmentProps) {
  const t = useTranslations('orders.order');
  const words = useOrderWords();
  const label = useStatusLabel();
  const openPage = useOpenPage();
  const seller = consignment.vendorName ?? t('storeItems');
  const { tracking } = consignment;

  return (
    <RowGroup>
      {named ? (
        <View
          key="seller"
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${seller}, ${label('order', consignment.status)}`}
          className="min-h-14 flex-row items-center gap-3 px-4 py-3">
          <IconCircle icon="store" />
          <Text variant="label" numberOfLines={2} className="flex-1">
            {seller}
          </Text>
          <OrderStatusChip status={consignment.status} className="self-center" />
        </View>
      ) : null}
      {lines.map((line) => (
        <LineRow key={`line-${line.index}`} line={line} />
      ))}
      {consignment.pickup ? (
        <ValueRow key="pickup" label={t('delivery')} value={t('pickup')} />
      ) : null}
      {tracking?.carrier ? (
        <ValueRow key="carrier" label={t('carrier')} value={tracking.carrier} />
      ) : null}
      {tracking?.number ? <TrackingNumberRow key="number" number={tracking.number} /> : null}
      {tracking?.url ? (
        <ActionRow
          key="track"
          icon="truck"
          title={t('track')}
          onPress={() => openPage(tracking.url as string, t('track'))}
        />
      ) : null}
      {consignment.shippedAt ? (
        <ValueRow
          key="shipped"
          label={t('shippedAt')}
          value={words.longDate(consignment.shippedAt)}
        />
      ) : null}
      {consignment.deliveredAt ? (
        <ValueRow
          key="delivered"
          label={t('deliveredAt')}
          value={words.longDate(consignment.deliveredAt)}
        />
      ) : null}
      {consignment.cancelledAt ? (
        <ValueRow
          key="cancelled"
          label={t('cancelledAt')}
          value={words.longDate(consignment.cancelledAt)}
        />
      ) : null}
      {showTotal ? (
        <MoneyRow key="total" label={t('shipmentTotal')} money={consignment.total} />
      ) : null}
      {onCancel ? (
        <ActionRow
          key="cancel"
          icon="x-circle"
          destructive
          title={t('cancelPart')}
          disabled={busy}
          onPress={onCancel}
        />
      ) : null}
    </RowGroup>
  );
}

function LineRow({ line }: { line: OrderLine }) {
  const t = useTranslations('orders');
  const details = [line.variantName, line.sku ? t('order.sku', { sku: line.sku }) : null]
    .filter(Boolean)
    .join(' · ');
  const quantity = t('order.quantity', {
    quantity: line.quantity,
    price: line.unitPrice.formatted,
  });

  return (
    <ListRow
      leading={
        <AppImage image={line.image} size="thumb" className="size-11 rounded-md" decorative />
      }
      title={line.name}
      titleEnd={<Price money={line.lineTotal} />}
      subtitle={details || undefined}
      meta={quantity}
      metaEnd={line.preOrder ? <StatusChip tone="neutral" label={t('preOrder')} /> : undefined}
      accessibilityLabel={[line.name, details, quantity, line.lineTotal.formatted]
        .filter(Boolean)
        .join(', ')}
    />
  );
}

/** The tracking number, left to right in every language, with a button that copies it. */
function TrackingNumberRow({ number }: { number: string }) {
  const t = useTranslations('orders.order');
  const toast = useToast();

  return (
    <View className="min-h-11 flex-row items-center gap-3 py-1 ps-4 pe-2">
      <Text className="text-muted">{t('trackingNumber')}</Text>
      <Text
        selectable
        numberOfLines={1}
        className="ms-auto shrink"
        style={{ writingDirection: 'ltr' }}>
        {number}
      </Text>
      <IconButton
        icon="copy"
        variant="plain"
        label={t('copyTracking')}
        onPress={() => {
          void Clipboard.setStringAsync(number).then(() =>
            toast.show({ message: t('trackingCopied'), tone: 'success' })
          );
        }}
      />
    </View>
  );
}

/** An amount in a row of facts: regular weight, bold for the total. */
function MoneyRow({
  label,
  money,
  strong = false,
}: {
  label: string;
  money: Money;
  strong?: boolean;
}) {
  return (
    <ValueRow
      label={label}
      value={<Price money={money} className={strong ? undefined : 'font-normal'} />}
      valueLabel={money.formatted}
    />
  );
}

/** How it is paid and what it comes to. Tax, discount and refunds show when there are some. */
export function PaymentSection({ order }: { order: OrderDetail }) {
  const t = useTranslations('orders.order');
  const words = useOrderWords();
  const label = useStatusLabel();
  const { totals } = order;

  return (
    <Section title={t('payment')}>
      <RowGroup>
        <ValueRow
          label={t('paymentStatus')}
          value={<PaymentStatusChip status={order.paymentStatus} />}
          valueLabel={label('payment', order.paymentStatus)}
        />
        <ValueRow label={t('paymentMethod')} value={words.paymentMethod(order.paymentMethod)} />
        <MoneyRow label={t('subtotal')} money={totals.subtotal} />
        <MoneyRow label={t('shipping')} money={totals.shipping} />
        {totals.tax.amount !== 0 ? <MoneyRow label={t('tax')} money={totals.tax} /> : null}
        {totals.discount.amount !== 0 ? (
          <MoneyRow label={t('discount')} money={totals.discount} />
        ) : null}
        <MoneyRow label={t('total')} money={totals.total} strong />
        {totals.refunded && totals.refunded.amount !== 0 ? (
          <MoneyRow label={t('refunded')} money={totals.refunded} />
        ) : null}
      </RowGroup>
    </Section>
  );
}

function addressLines(address: OrderAddress): string[] {
  const place = [[address.city, address.state].filter(Boolean).join(', '), address.postalCode]
    .filter(Boolean)
    .join(' ');
  return [
    address.name,
    [address.street, address.apartment].filter(Boolean).join(', '),
    place,
    address.country,
    address.phone,
  ].filter((line): line is string => Boolean(line));
}

function AddressRow({ label, address }: { label: string; address: OrderAddress }) {
  const lines = addressLines(address);
  return (
    <View accessible accessibilityLabel={[label, ...lines].join(', ')} className="gap-1 px-4 py-3">
      <Text className="text-muted">{label}</Text>
      <Text selectable>{lines.join('\n')}</Text>
    </View>
  );
}

const sameAddress = (a: OrderAddress, b: OrderAddress) =>
  addressLines(a).join('\n') === addressLines(b).join('\n');

/** How it travels and where to. The billing address only where it differs. */
export function DeliverySection({ order }: { order: OrderDetail }) {
  const t = useTranslations('orders.order');
  const { shippingAddress, billingAddress, shippingMethod } = order;
  if (!shippingMethod && !shippingAddress && !billingAddress) return null;
  const billing =
    billingAddress && !(shippingAddress && sameAddress(shippingAddress, billingAddress));

  return (
    <Section title={t('delivery')}>
      <RowGroup>
        {shippingMethod ? <ValueRow label={t('shippingMethod')} value={shippingMethod} /> : null}
        {shippingAddress ? <AddressRow label={t('shipTo')} address={shippingAddress} /> : null}
        {billing ? <AddressRow label={t('billTo')} address={billingAddress} /> : null}
      </RowGroup>
    </Section>
  );
}

/** The note the customer left at checkout, in their own words. */
export function NoteSection({ note }: { note: string }) {
  const t = useTranslations('orders.order');
  return (
    <Section title={t('note')}>
      <View className="rounded-xl bg-surface px-4 py-3">
        <Text variant="long" selectable>
          {note}
        </Text>
      </View>
    </Section>
  );
}

const EVENT_ICONS: Record<string, IconName> = {
  placed: 'order-placed',
  status_change: 'refresh',
  status_override: 'refresh',
  payment: 'wallet',
  refund: 'return',
  update: 'file-text',
  note: 'file-text',
  shipped: 'truck',
  delivered: 'delivered',
  cancelled: 'x-circle',
};

/** Events the app words itself; the others carry what the store recorded. */
const WORDED_EVENTS = new Set(['placed', 'shipped', 'delivered', 'cancelled']);

/** What happened to the order, newest first, down a line. */
export function TimelineSection({ events }: { events: OrderTimelineEvent[] }) {
  const t = useTranslations('orders.order');
  if (events.length === 0) return null;

  return (
    <Section title={t('timeline')}>
      <View className="rounded-xl bg-surface px-4 pt-4">
        {events.map((event, index) => (
          <TimelineEvent
            key={`${event.at}-${index}`}
            event={event}
            last={index === events.length - 1}
          />
        ))}
      </View>
    </Section>
  );
}

function TimelineEvent({ event, last }: { event: OrderTimelineEvent; last: boolean }) {
  const t = useTranslations('orders.order');
  const words = useOrderWords();
  const what = WORDED_EVENTS.has(event.kind)
    ? t(`events.${event.kind as 'placed' | 'shipped' | 'delivered' | 'cancelled'}`)
    : event.message;
  const when = words.longDate(event.at);
  const meta = event.by ? t('eventBy', { date: when, name: event.by }) : when;
  const note = event.kind === 'note';

  return (
    <View
      accessible
      accessibilityLabel={[note ? t('teamNote') : null, what, meta].filter(Boolean).join(', ')}
      className="flex-row gap-3">
      <View className="items-center">
        <IconCircle icon={EVENT_ICONS[event.kind] ?? 'clock'} />
        {last ? null : <View className="my-1 w-px flex-1 bg-border" />}
      </View>
      <View className="flex-1 gap-0.5 pt-1 pb-4">
        {note ? <Text variant="section">{t('teamNote')}</Text> : null}
        <Text variant={note ? 'long' : 'body'}>{what}</Text>
        <Text variant="meta">{meta}</Text>
      </View>
    </View>
  );
}
