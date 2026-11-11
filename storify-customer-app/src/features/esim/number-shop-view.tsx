import { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type {
  EsimNumberOnSale,
  EsimNumberShop,
  EsimNumberShopQuery,
} from '@/contracts/mobile/shop/v1/esim';

import { NumberBuySheet } from './number-buy-sheet';
import { useEsimNumberShop } from './use-numbers';

type Premium = NonNullable<EsimNumberShopQuery['premium']>;

/**
 * The numbers page (NUM-03), the website's /esim/numbers: filter by country
 * code, digits and memorable numbers, pick one, then its first credit and a
 * data package. Anyone may browse; buying asks a guest to sign in first.
 */
export function NumberShopView() {
  const t = useTranslations('esim.numbers');
  const tabBar = useTabBarHeight();
  const [query, setQuery] = useState<EsimNumberShopQuery>({});
  const [digits, setDigits] = useState('');
  const [chosen, setChosen] = useState<EsimNumberOnSale | null>(null);
  const shop = useEsimNumberShop(query);
  const go = (next: Partial<EsimNumberShopQuery>) =>
    setQuery((current) => ({ ...current, ...next }));

  if (shop.isPending) return <LoadingState />;
  if (shop.isError) return <ErrorState error={shop.error} onRetry={() => void shop.refetch()} />;
  const data = shop.data;

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={data.items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        className="flex-1"
        columnWrapperClassName="gap-3"
        contentContainerClassName="gap-3 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: tabBar + 16 }}
        ListHeaderComponent={
          <Filters shop={data} query={query} digits={digits} onDigits={setDigits} onChange={go} />
        }
        ListEmptyComponent={
          <EmptyState icon="phone" title={data.buyable ? t('none') : t('soon')} />
        }
        ListFooterComponent={
          data.pages > 1 ? (
            <View className="flex-row items-center justify-center gap-3 pt-2">
              <Button
                label={t('previous')}
                variant="outline"
                size="sm"
                disabled={data.page <= 1 || shop.isFetching}
                onPress={() => go({ page: data.page - 1 })}
              />
              <Text variant="caption">{t('pageOf', { page: data.page, pages: data.pages })}</Text>
              <Button
                label={t('next')}
                variant="outline"
                size="sm"
                disabled={data.page >= data.pages || shop.isFetching}
                onPress={() => go({ page: data.page + 1 })}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => <NumberCard number={item} onPress={() => setChosen(item)} />}
      />
      <NumberBuySheet shop={data} number={chosen} onClose={() => setChosen(null)} />
    </View>
  );
}

function Filters({
  shop,
  query,
  digits,
  onDigits,
  onChange,
}: {
  shop: EsimNumberShop;
  query: EsimNumberShopQuery;
  digits: string;
  onDigits: (value: string) => void;
  onChange: (next: Partial<EsimNumberShopQuery>) => void;
}) {
  const t = useTranslations('esim.numbers');
  const premium: Premium = query.premium ?? 'all';

  return (
    <View className="gap-3 pb-1">
      <Text variant="caption">{t('intro')}</Text>
      <SearchField
        label={t('digits')}
        placeholder={t('digits')}
        keyboardType="number-pad"
        value={digits}
        onChangeText={(text) => onDigits(text.replace(/\D/g, '').slice(0, 12))}
        onSubmit={() => onChange({ digits: digits || undefined, page: 1 })}
      />
      {shop.dialCodes.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2">
          <Chip
            label={t('anyCode')}
            kind="filter"
            selected={!query.code}
            onPress={() => onChange({ code: undefined, page: 1 })}
          />
          {shop.dialCodes.map((entry) => (
            <Chip
              key={entry.code}
              kind="filter"
              label={`+${entry.code}${entry.country ? ` ${entry.country}` : ''} (${entry.count})`}
              selected={query.code === entry.code}
              onPress={() => onChange({ code: entry.code, page: 1 })}
            />
          ))}
        </ScrollView>
      ) : null}
      <SegmentedTabs<Premium>
        label={t('show')}
        value={premium}
        onChange={(value) => onChange({ premium: value === 'all' ? undefined : value, page: 1 })}
        tabs={[
          { value: 'all', label: t('all') },
          { value: 'standard', label: t('standard') },
          { value: 'premium', label: t('premium') },
        ]}
      />
      <Text variant="caption">{t('count', { count: shop.total })}</Text>
    </View>
  );
}

function NumberCard({ number, onPress }: { number: EsimNumberOnSale; onPress: () => void }) {
  const t = useTranslations('esim.numbers');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${number.display}, ${number.price.formatted}`}
      onPress={onPress}
      className="flex-1 gap-1.5 rounded-xl bg-surface p-3 active:opacity-80">
      <View className="flex-row items-center justify-between gap-1">
        <Text variant="caption" numberOfLines={1} className="flex-1">
          +{number.dialCode}
          {number.country ? ` · ${number.country}` : ''}
        </Text>
        {number.premium ? <Icon name="star" size={14} colorClassName="accent-rating" /> : null}
      </View>
      <Text variant="label" className="font-mono" numberOfLines={1} adjustsFontSizeToFit>
        {number.display.replace(/^\+\d+\s/, '')}
      </Text>
      <Text variant="price" className="text-link">
        {number.price.formatted}
      </Text>
      {number.premium ? (
        <Text variant="caption" className="text-rating">
          {t('premium')}
        </Text>
      ) : null}
    </Pressable>
  );
}
