import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ShopperReturn } from '@/contracts/mobile/shop/v1';

/** A label of the store's, as it sends it: the status of a return or of its refund. */
export function LabelPill({ label }: { label: string }) {
  return (
    <View className="self-start rounded-full bg-surface-alt px-2.5 py-1">
      <Text variant="chip">{label}</Text>
    </View>
  );
}

/**
 * One return in a list: its number, the order it comes from, where it stands
 * and where its refund stands, in the store's words, and the refund as sent.
 */
export function ReturnCard({ item }: { item: ShopperReturn }) {
  const t = useTranslations('returns');
  const format = useFormatter();
  const router = useRouter();
  const requested = format.dateTime(new Date(item.times.requestedAt), { dateStyle: 'medium' });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('number', { number: item.number })}, ${item.statusLabel}, ${t('refundStatus', { status: item.refundStatusLabel })}`}
      onPress={() => router.push({ pathname: '/account/returns/[id]', params: { id: item.id } })}
      className="min-h-11 gap-3 rounded-xl bg-surface p-4 active:opacity-80">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text variant="subheading">{t('number', { number: item.number })}</Text>
          <Text variant="caption">
            {t('cardSubtitle', { order: item.orderNumber, date: requested })}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} directional />
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <LabelPill label={item.statusLabel} />
        <Text variant="caption">{t('refundStatus', { status: item.refundStatusLabel })}</Text>
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-muted">{t('refundTotal')}</Text>
        <Text variant="price">{item.refund.total.formatted}</Text>
      </View>
    </Pressable>
  );
}
