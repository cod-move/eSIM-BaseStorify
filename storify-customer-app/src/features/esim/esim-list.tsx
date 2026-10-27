import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Reveal, useReveal } from '@/components/ui/motion';
import { Text } from '@/components/ui/text';
import type { EsimSummary } from '@/contracts/mobile/shop/v1/esim';

import { EsimStatus } from './esim-status';
import { UsageBar } from './usage-bar';

/** The shopper's eSIMs: one card each, 12 pt apart. */
export function EsimList({ esims }: { esims: EsimSummary[] }) {
  const router = useRouter();
  const tabBar = useTabBarHeight();
  const reveal = useReveal();
  const t = useTranslations('esim');

  return (
    <FlatList
      data={esims}
      keyExtractor={(esim) => esim.id}
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      ListFooterComponent={
        <Button
          label={t('buyAnother')}
          variant="secondary"
          icon="globe"
          onPress={() => router.push('/esim')}
        />
      }
      renderItem={({ item, index }) => (
        <Reveal entering={reveal(index)}>
          <EsimCard
            esim={item}
            onPress={() =>
              router.push({ pathname: '/account/esims/[id]', params: { id: item.id } })
            }
          />
        </Reveal>
      )}
    />
  );
}

function EsimCard({ esim, onPress }: { esim: EsimSummary; onPress: () => void }) {
  const t = useTranslations('esim');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={esim.remark ?? esim.planName}
      onPress={onPress}
      className="gap-3 rounded-xl bg-surface p-4 active:opacity-80">
      <View className="flex-row items-start gap-3">
        {esim.emoji ? <Text variant="heading">{esim.emoji}</Text> : <Icon name="globe" size={24} />}
        <View className="flex-1 gap-0.5">
          <Text variant="subheading" numberOfLines={2}>
            {esim.remark ?? esim.planName}
          </Text>
          <Text variant="caption" className="text-muted" numberOfLines={1}>
            {esim.remark ? esim.planName : esim.destination}
            {esim.iccidEnd ? ` · ${t('iccidEnd', { digits: esim.iccidEnd })}` : ''}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} directional />
      </View>
      <EsimStatus status={esim.status} tone={esim.tone} />
      {esim.usage ? <UsageBar usage={esim.usage} /> : null}
    </Pressable>
  );
}
