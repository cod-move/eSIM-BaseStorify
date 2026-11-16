import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { FilterTabs } from '@/components/ui/filter-tabs';
import { Price } from '@/components/ui/price';
import { Screen, StackHeader } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import {
  NUMBER_STATUSES,
  type NumberRow,
  type NumberStatusFilter,
} from '@/contracts/mobile/biz/v1/esim';
import { useShortDate } from '@/i18n/use-list-time';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { PagedList } from './paged-list';
import { useNumbers } from './use-esim';

const TONES: Record<string, StatusTone> = {
  available: 'success',
  reserved: 'warning',
  sold: 'info',
  retired: 'neutral',
};

/** The phone numbers (TopConnect number cards): in stock, held in a cart, sold or retired. */
export function NumbersScreen() {
  const t = useTranslations('esim.numbers');
  const [status, setStatus] = useState<NumberStatusFilter>('all');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const list = useNumbers(status, term);
  const counts = list.data?.counts;

  return (
    <Screen header={<StackHeader title={t('title')} icon="phone" />}>
      <View className="gap-3 px-4 pb-3">
        <SearchField label={t('search')} value={search} onChangeText={setSearch} />
        <FilterTabs
          label={t('title')}
          tabs={NUMBER_STATUSES.map((value) => ({
            value,
            label: t(`statuses.${value}`),
            count: counts && value !== 'all' ? counts[value] : undefined,
          }))}
          value={status}
          onChange={setStatus}
        />
      </View>
      <PagedList
        query={list}
        renderItem={(number) => <NumberCard number={number} />}
        empty={{ icon: 'phone', title: t('emptyTitle'), body: t('emptyBody') }}
      />
    </Screen>
  );
}

function NumberCard({ number }: { number: NumberRow }) {
  const t = useTranslations('esim.numbers');
  const date = useShortDate();
  const known = ['available', 'reserved', 'sold', 'retired'] as const;
  const status = (known as readonly string[]).includes(number.status)
    ? t(`statuses.${number.status as (typeof known)[number]}`)
    : number.status;
  const meta = [
    number.country,
    number.reservedUntil ? t('reservedUntil', { date: date(number.reservedUntil) }) : null,
    number.soldAt ? t('soldAt', { date: date(number.soldAt) }) : null,
    number.batch ? t('batch', { batch: number.batch }) : null,
  ].filter(Boolean);

  return (
    <View className="gap-1.5 rounded-[20px] border border-transparent bg-surface p-3 dark:border-border">
      <View className="flex-row items-center gap-2">
        <Text variant="label" className="flex-1" selectable>
          +{number.msisdn}
        </Text>
        <StatusChip tone={TONES[number.status] ?? 'neutral'} label={status} />
      </View>
      <View className="flex-row items-center gap-2">
        <Price money={number.price} />
        <Text variant="caption" className="flex-1" numberOfLines={1} selectable>
          {number.iccid}
        </Text>
      </View>
      {number.customerEmail ? <Text variant="meta">{number.customerEmail}</Text> : null}
      {meta.length ? <Text variant="caption">{meta.join(' · ')}</Text> : null}
      {number.note ? <Text variant="meta">{number.note}</Text> : null}
    </View>
  );
}
