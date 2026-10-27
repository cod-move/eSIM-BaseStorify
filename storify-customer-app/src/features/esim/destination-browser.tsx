import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Icon } from '@/components/ui/icon';
import { Price } from '@/components/ui/price';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Text } from '@/components/ui/text';
import type { EsimDestination, EsimDestinationList } from '@/contracts/mobile/shop/v1/esim';

import { destinationHref } from './destination-path';

type Tab = 'local' | 'regional' | 'global';

/**
 * Where the shopper is going (APP-02): countries, regions and global plans,
 * and a search across all three by name or country code.
 */
export function DestinationBrowser({ destinations }: { destinations: EsimDestinationList }) {
  const t = useTranslations('esim');
  const router = useRouter();
  const tabBar = useTabBarHeight();
  const [tab, setTab] = useState<Tab>('local');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    if (!words) return destinations[tab];
    return [...destinations.local, ...destinations.regional, ...destinations.global].filter(
      (destination) =>
        destination.name.toLowerCase().includes(words) ||
        destination.countries.some((code) => code.toLowerCase() === words)
    );
  }, [destinations, tab, query]);

  return (
    <FlatList
      data={shown}
      keyExtractor={(destination) => `${destination.pathScope}:${destination.slug}`}
      className="flex-1 bg-background"
      contentContainerClassName="gap-2 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View className="gap-3 pb-1">
          <SearchField label={t('searchDestinations')} value={query} onChangeText={setQuery} />
          {query.trim() ? null : (
            <SegmentedTabs
              label={t('destinationKinds')}
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'local', label: t('countries'), count: destinations.local.length },
                { value: 'regional', label: t('regions'), count: destinations.regional.length },
                { value: 'global', label: t('global'), count: destinations.global.length },
              ]}
            />
          )}
        </View>
      }
      ListEmptyComponent={
        <Text className="py-8 text-center text-muted">{t('noDestinations')}</Text>
      }
      renderItem={({ item }) => (
        <DestinationRow destination={item} onPress={() => router.push(destinationHref(item))} />
      )}
    />
  );
}

function DestinationRow({
  destination,
  onPress,
}: {
  destination: EsimDestination;
  onPress: () => void;
}) {
  const t = useTranslations('esim');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={destination.name}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 rounded-xl bg-surface px-4 py-3 active:opacity-80">
      {destination.emoji ? (
        <Text variant="heading">{destination.emoji}</Text>
      ) : (
        <Icon name="globe" size={24} />
      )}
      <View className="flex-1 gap-0.5">
        <Text variant="subheading" numberOfLines={1}>
          {destination.name}
        </Text>
        {destination.scope === 'local' ? null : (
          <Text variant="caption">
            {t('countryCount', { count: destination.countries.length })}
          </Text>
        )}
      </View>
      {destination.fromPrice ? <Price price={destination.fromPrice} from size="sm" /> : null}
      <Icon name="chevron-right" size={20} directional />
    </Pressable>
  );
}
