import { ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Divider } from '@/components/ui/divider';
import { Text } from '@/components/ui/text';
import type { ReturnTimes, ShopperReturn } from '@/contracts/mobile/shop/v1';
import { ProductLink } from '@/features/catalog/product-link';

import { Panel, RefundRows, Row } from './refund-rows';
import { LabelPill } from './return-card';

/** The steps a return can reach, in the order they happen. A step not reached is not sent. */
const STEPS = [
  'requestedAt',
  'approvedAt',
  'rejectedAt',
  'receivedAt',
  'refundedAt',
  'closedAt',
] as const satisfies readonly (keyof ReturnTimes)[];

/** One return: where it stands, its refund, when each step happened, and its lines. */
export function ReturnDetailView({ item }: { item: ShopperReturn }) {
  const t = useTranslations('returns');
  const format = useFormatter();
  const tabBar = useTabBarHeight();
  const when = (at: string) =>
    format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'short' });
  const destination = item.refundDestination;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}>
      <View className="gap-3 rounded-xl bg-surface p-4">
        <View className="gap-1">
          <Text variant="subheading">{t('number', { number: item.number })}</Text>
          <Text variant="caption">{t('fromOrder', { number: item.orderNumber })}</Text>
        </View>
        <LabelPill label={item.statusLabel} />
        <Row label={t('refundStatusLabel')} value={item.refundStatusLabel} />
        <Row label={t('reasonLabel')} value={item.reasonLabel} />
        {item.note ? <Text className="text-muted">{item.note}</Text> : null}
        {item.rejectionReason ? <Text className="text-danger">{item.rejectionReason}</Text> : null}
        {item.instructions ? <Text>{item.instructions}</Text> : null}
      </View>

      <Panel title={t('stepsHeading')}>
        {STEPS.map((step) => {
          const at = item.times[step];
          return at ? <Row key={step} label={t(`steps.${step}`)} value={when(at)} /> : null;
        })}
      </Panel>

      <Panel title={t('itemsHeading')}>
        {item.lines.map((line, index) => (
          <View key={line.index} className="gap-3">
            {index > 0 ? <Divider /> : null}
            <ProductLink product={line} className="flex-row items-center gap-3">
              <AppImage image={line.image} size="thumb" className="size-12 rounded-md" />
              <View className="flex-1 gap-0.5">
                <Text variant="product" numberOfLines={2}>
                  {line.name}
                </Text>
                <Text variant="caption">
                  {t('requestedQuantity', { count: line.quantityRequested })}
                </Text>
                {line.quantityApproved !== undefined ? (
                  <Text variant="caption">
                    {t('approvedQuantity', { count: line.quantityApproved })}
                  </Text>
                ) : null}
              </View>
              <Text variant="price">{line.unitPrice.formatted}</Text>
            </ProductLink>
          </View>
        ))}
      </Panel>

      <Panel title={t('refundHeading')}>
        <RefundRows refund={item.refund} />
        {item.refunded ? <Row label={t('refundedSoFar')} value={item.refunded.formatted} /> : null}
      </Panel>

      {destination ? (
        <Panel title={t('destinationHeading')}>
          <Text className="font-semibold">{destination.label}</Text>
          {[destination.provider, destination.accountName, destination.accountNumber]
            .filter((part): part is string => Boolean(part))
            .map((part) => (
              <Text key={part}>{part}</Text>
            ))}
        </Panel>
      ) : null}
    </ScrollView>
  );
}
