import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { FilterTabs } from '@/components/ui/filter-tabs';
import { Price } from '@/components/ui/price';
import { Screen, StackHeader } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import { TOPUP_VIEWS, type TopupRow, type TopupView } from '@/contracts/mobile/biz/v1/esim';
import { useDateTime } from '@/i18n/use-list-time';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { stateTone, supplierName } from './format';
import { PagedList } from './paged-list';
import { useTopups } from './use-esim';

/** Data top-ups bought for eSIMs, by view (needs action, failed, stuck, completed, all). */
export function TopupsScreen() {
  const t = useTranslations('esim.topups');
  const [view, setView] = useState<TopupView>('all');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const list = useTopups(view, term);
  const counts = list.data?.counts;

  return (
    <Screen header={<StackHeader title={t('title')} icon="refresh" />}>
      <View className="gap-3 px-4 pb-3">
        <SearchField label={t('search')} value={search} onChangeText={setSearch} />
        <FilterTabs
          label={t('title')}
          tabs={TOPUP_VIEWS.map((value) => ({
            value,
            label: t(`views.${value}`),
            count:
              counts && (value === 'attention' || value === 'failed' || value === 'stuck')
                ? counts[value]
                : undefined,
          }))}
          value={view}
          onChange={setView}
        />
      </View>
      <PagedList
        query={list}
        renderItem={(topup) => <TopupCard topup={topup} />}
        empty={{ icon: 'refresh', title: t('emptyTitle'), body: t('emptyBody') }}
      />
    </Screen>
  );
}

function TopupCard({ topup }: { topup: TopupRow }) {
  const t = useTranslations('esim.topups');
  const when = useDateTime();
  const known = ['queued', 'processing', 'completed', 'failed'] as const;
  const state = (known as readonly string[]).includes(topup.state)
    ? t(`states.${topup.state as (typeof known)[number]}`)
    : topup.state;
  const body = (
    <>
      <View className="flex-row items-start gap-2">
        <Text variant="label" numberOfLines={2} className="flex-1">
          {topup.name}
        </Text>
        <StatusChip tone={stateTone(topup.state)} label={state} />
      </View>
      <View className="flex-row items-center gap-2">
        <Price money={topup.price} />
        <Text variant="caption" className="flex-1" numberOfLines={1}>
          {[supplierName(topup.provider), when(topup.createdAt)].join(' · ')}
        </Text>
      </View>
      <Text variant="meta" numberOfLines={1} selectable>
        {[topup.orderNumber, topup.iccid].filter(Boolean).join(' · ')}
      </Text>
      {topup.customerEmail ? <Text variant="meta">{topup.customerEmail}</Text> : null}
      {topup.error ? (
        <Text variant="meta" className="text-danger" numberOfLines={3}>
          {topup.error}
        </Text>
      ) : null}
      {topup.refundState ? (
        <Text variant="meta">{t('refund', { state: topup.refundState })}</Text>
      ) : null}
    </>
  );
  const className =
    'gap-1.5 rounded-[20px] border border-transparent bg-surface p-3 dark:border-border';

  return topup.esimId ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[topup.name, state, topup.orderNumber].join(', ')}
      onPress={() => router.push(`/esim/esims/${encodeURIComponent(topup.esimId!)}` as Href)}
      className={`${className} active:opacity-80`}>
      {body}
    </Pressable>
  ) : (
    <View className={className}>{body}</View>
  );
}
