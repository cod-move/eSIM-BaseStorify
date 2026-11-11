import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Icon } from '@/components/ui/icon';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Text } from '@/components/ui/text';
import type { EsimDestinationList } from '@/contracts/mobile/shop/v1/esim';

import { DestinationCard } from './destination-card';
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
  // Two cards a row, 16 pt at the sides and 12 between them.
  const cardWidth = (useWindowDimensions().width - 32 - 12) / 2;
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
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View className="gap-3 pb-1">
          <SearchField
            label={t('searchDestinations')}
            placeholder={t('searchDestinations')}
            value={query}
            onChangeText={setQuery}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/esim/devices')}
            className="flex-row items-center gap-2 py-1 active:opacity-70">
            <Icon name="phone" size={18} />
            <Text className="flex-1 text-link">{t('checkPhone')}</Text>
          </Pressable>
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
        <DestinationCard
          destination={item}
          onPress={() => router.push(destinationHref(item))}
          className="bg-surface"
          style={{ width: cardWidth }}
        />
      )}
    />
  );
}
