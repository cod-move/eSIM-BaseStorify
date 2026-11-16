import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { FilterTabs } from '@/components/ui/filter-tabs';
import { Screen, StackHeader } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import type { EsimRow } from '@/contracts/mobile/biz/v1/esim';
import { useShortDate } from '@/i18n/use-list-time';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { bytesLabel, supplierName, toneOf } from './format';
import { PagedList } from './paged-list';
import { useEsims } from './use-esim';

const LIFECYCLES = [
  '',
  'in_use',
  'installed',
  'not_installed',
  'depleted',
  'expired',
  'cancelled',
] as const;
type Lifecycle = (typeof LIFECYCLES)[number];

/** Every issued eSIM: a search by ICCID, order number or email, and the supplier's status. */
export function EsimsScreen() {
  const t = useTranslations('esim');
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState<Lifecycle>('');
  const term = useDebouncedValue(search.trim());
  const list = useEsims(term, lifecycle);

  return (
    <Screen header={<StackHeader title={t('hub.esims')} icon="search" />}>
      <View className="gap-3 px-4 pb-3">
        <SearchField label={t('list.search')} value={search} onChangeText={setSearch} />
        <FilterTabs
          label={t('detail.lifecycle')}
          tabs={LIFECYCLES.map((value) => ({ value, label: t(`lifecycle.${value || 'all'}`) }))}
          value={lifecycle}
          onChange={setLifecycle}
        />
        {list.data ? (
          <Text variant="caption">{t('list.total', { count: list.data.total })}</Text>
        ) : null}
      </View>
      <PagedList
        query={list}
        renderItem={(esim) => <EsimCard esim={esim} />}
        empty={{ icon: 'search', title: t('list.emptyTitle'), body: t('list.emptyBody') }}
      />
    </Screen>
  );
}

/** One eSIM in a list: plan, card, shopper, status and data left. Opens its detail. */
export function EsimCard({ esim }: { esim: EsimRow }) {
  const t = useTranslations('esim');
  const date = useShortDate();
  const card = esim.iccid ?? (esim.simId ? `${t('detail.simId')} ${esim.simId}` : '—');
  const left = bytesLabel(esim.remainingBytes);
  const total = bytesLabel(esim.totalBytes);
  const meta = [
    esim.orderNumber,
    supplierName(esim.provider),
    left && total ? t('list.left', { left, total }) : null,
    esim.expiresAt ? t('list.expires', { date: date(esim.expiresAt) }) : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[esim.plan, card, esim.customerEmail, esim.statusLabel]
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.push(`/esim/esims/${encodeURIComponent(esim.id)}` as Href)}
      className="gap-1.5 rounded-[20px] border border-transparent bg-surface p-3 active:opacity-80 dark:border-border">
      <View className="flex-row items-start gap-2">
        <Text variant="label" numberOfLines={2} className="flex-1">
          {esim.plan}
        </Text>
        <StatusChip tone={toneOf(esim.tone)} label={esim.statusLabel} />
      </View>
      <Text variant="meta" numberOfLines={1} selectable>
        {card}
      </Text>
      {esim.customerEmail ? (
        <Text variant="meta" numberOfLines={1}>
          {esim.customerEmail}
        </Text>
      ) : null}
      <Text variant="caption" numberOfLines={2}>
        {meta.join(' · ')}
      </Text>
    </Pressable>
  );
}
