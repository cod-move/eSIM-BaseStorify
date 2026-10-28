import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Price } from '@/components/ui/price';
import { Text } from '@/components/ui/text';
import type { EsimDestinationsBlock, EsimDeviceCheckBlock } from '@/contracts/mobile/shop/v1/esim';
import { BlockTitle } from '@/features/home/blocks/block-title';

import { destinationHref } from './destination-path';

/**
 * The website's eSIM sections on the home screen (APP-01, patch P8): a search
 * box that opens the destinations, and the destinations the section picked,
 * in a row a thumb scrolls.
 */
export function EsimDestinations({ block }: { block: EsimDestinationsBlock }) {
  const t = useTranslations('esim');
  const router = useRouter();

  return (
    <View className="gap-3">
      {block.title ? (
        <BlockTitle title={block.title} onViewAll={() => router.push('/esim')} />
      ) : null}
      {block.subtitle ? <Text className="px-4 text-muted">{block.subtitle}</Text> : null}
      {block.searchPlaceholder !== undefined ? (
        <View className="px-4">
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={block.searchPlaceholder || t('searchDestinations')}
            onPress={() => router.push('/esim')}
            className="min-h-12 flex-row items-center gap-2 rounded-full border border-border bg-background px-4 active:opacity-80">
            <Icon name="search" size={20} />
            <Text className="flex-1 text-muted" numberOfLines={1}>
              {block.searchPlaceholder || t('searchDestinations')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {block.destinations.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4">
          {block.destinations.map((destination) => (
            <Pressable
              key={`${destination.pathScope}:${destination.slug}`}
              accessibilityRole="link"
              accessibilityLabel={destination.name}
              onPress={() => router.push(destinationHref(destination))}
              className="w-36 gap-1 rounded-xl bg-surface p-3 active:opacity-80">
              {destination.emoji ? (
                <Text variant="heading">{destination.emoji}</Text>
              ) : (
                <Icon name="globe" size={24} />
              )}
              <Text variant="subheading" numberOfLines={1}>
                {destination.name}
              </Text>
              {block.showPrice && destination.fromPrice ? (
                <Price price={destination.fromPrice} from size="sm" />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** "Does my phone take an eSIM?": a card leading to the check. */
export function EsimDeviceCheckCard({ block }: { block: EsimDeviceCheckBlock }) {
  const router = useRouter();

  return (
    <View className="px-4">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={block.title}
        onPress={() => router.push('/esim/devices')}
        className="flex-row items-center gap-3 rounded-xl bg-surface p-4 active:opacity-80">
        <Icon name="phone" size={24} />
        <View className="flex-1 gap-0.5">
          <Text variant="subheading">{block.title}</Text>
          {block.subtitle ? <Text variant="caption">{block.subtitle}</Text> : null}
        </View>
        <Icon name="chevron-right" size={20} directional />
      </Pressable>
    </View>
  );
}
