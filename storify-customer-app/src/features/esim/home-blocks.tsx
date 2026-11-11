import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type {
  EsimDestinationsBlock,
  EsimDeviceCheckBlock,
  EsimNumbersEntryBlock,
} from '@/contracts/mobile/shop/v1/esim';
import { useConfig } from '@/features/config/use-config';
import { BlockTitle } from '@/features/home/blocks/block-title';
import { useOpenPage } from '@/features/web/use-open-page';
import { cn } from '@/lib/cn';
import { joinWebsiteUrl } from '@/lib/links';

import { DestinationGrid } from './destination-card';
import { DestinationFlag } from './destination-flag';
import { DESTINATIONS_TAB, destinationHref } from './destination-path';

/**
 * The website's eSIM sections on the home screen (APP-01, patch P8), each in
 * the app's own form: the hero is a search box only (the popular destinations
 * have a section of their own below it); the popular destinations a row of
 * round flags; the destination tabs two columns of cards under the tabs.
 */
export function EsimDestinations({ block }: { block: EsimDestinationsBlock }) {
  if (block.searchPlaceholder !== undefined) return <DestinationSearch block={block} />;
  if (block.tabs?.length) return <DestinationTabs block={block} />;
  return <PopularDestinations block={block} />;
}

function DestinationSearch({ block }: { block: EsimDestinationsBlock }) {
  const t = useTranslations('esim');
  const router = useRouter();
  const label = block.searchPlaceholder || t('searchDestinations');

  return (
    <View className="gap-3 px-4">
      {block.title ? <Text variant="title">{block.title}</Text> : null}
      {block.subtitle ? <Text className="text-muted">{block.subtitle}</Text> : null}
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={label}
        onPress={() => router.push(DESTINATIONS_TAB)}
        className="min-h-12 flex-row items-center gap-2 rounded-full border border-border bg-background px-4 active:opacity-80">
        <Icon name="search" size={20} />
        <Text className="flex-1 text-muted" numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

/** A thumb-scrolled row of round flags, the name under each. */
function PopularDestinations({ block }: { block: EsimDestinationsBlock }) {
  const router = useRouter();
  if (!block.destinations.length) return null;

  return (
    <View className="gap-3">
      {block.title ? (
        <BlockTitle title={block.title} onViewAll={() => router.push(DESTINATIONS_TAB)} />
      ) : null}
      {block.subtitle ? <Text className="px-4 text-muted">{block.subtitle}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-1 px-3 py-1">
        {block.destinations.map((destination) => (
          <Pressable
            key={`${destination.pathScope}:${destination.slug}`}
            accessibilityRole="link"
            accessibilityLabel={destination.name}
            onPress={() => router.push(destinationHref(destination))}
            className="w-[76px] items-center gap-2 active:opacity-70">
            <DestinationFlag destination={destination} size={56} />
            <Text variant="caption" className="text-center text-foreground" numberOfLines={1}>
              {destination.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Countries, regions and global, each its popular destinations two by two. */
function DestinationTabs({ block }: { block: EsimDestinationsBlock }) {
  const t = useTranslations('esim');
  const router = useRouter();
  const tabs = block.tabs ?? [];
  const [scope, setScope] = useState(tabs[0]?.scope);
  const current = tabs.find((tab) => tab.scope === scope) ?? tabs[0];
  if (!current) return null;

  return (
    <View className="gap-3">
      {block.title ? (
        <BlockTitle title={block.title} onViewAll={() => router.push(DESTINATIONS_TAB)} />
      ) : null}
      <View className="mx-4 overflow-hidden rounded-3xl bg-surface">
        <View className="flex-row" accessibilityRole="tablist">
          {tabs.map((tab) => {
            const active = tab.scope === current.scope;
            return (
              <Pressable
                key={tab.scope}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setScope(tab.scope)}
                className={cn(
                  'min-h-12 flex-1 items-center justify-center px-2 py-3',
                  active ? 'bg-surface' : 'bg-surface-alt'
                )}>
                <Text
                  variant="subheading"
                  numberOfLines={1}
                  className={active ? 'text-foreground' : 'text-muted'}>
                  {tab.label}
                </Text>
                {active ? <View className="mt-1 h-1 w-6 rounded-full bg-accent" /> : null}
              </Pressable>
            );
          })}
        </View>
        <View className="gap-3 p-3">
          <DestinationGrid
            destinations={current.destinations}
            showPrice={block.showPrice}
            onPress={(destination) => router.push(destinationHref(destination))}
          />
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(DESTINATIONS_TAB)}
            className="min-h-11 flex-row items-center justify-center gap-1 active:opacity-70">
            <Text className="text-link">{t('allDestinations')}</Text>
            <Icon name="chevron-right" size={18} directional colorClassName="accent-link" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** "Need a phone number?" (NUM-03): the numbers page, a web page in the app. */
export function EsimNumbersEntry({ block }: { block: EsimNumbersEntryBlock }) {
  const openPage = useOpenPage();
  const website = useConfig().data?.store.websiteUrl;

  return (
    <View className="px-4">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={block.title}
        disabled={!website}
        onPress={() => website && openPage(joinWebsiteUrl(website, block.path))}
        className="gap-3 rounded-2xl border border-border bg-surface p-4 active:opacity-80">
        <View className="flex-row items-center gap-3">
          <View className="size-11 items-center justify-center rounded-full bg-accent">
            <Icon name="phone" size={22} colorClassName="accent-accent-foreground" />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="subheading">{block.title}</Text>
            {block.subtitle ? <Text variant="caption">{block.subtitle}</Text> : null}
          </View>
        </View>
        {block.samples.length ? (
          <View className="flex-row flex-wrap gap-2">
            {block.samples.map((sample) => (
              <View key={sample} className="rounded-full border border-border bg-background px-3 py-1">
                <Text variant="caption" className="text-foreground">
                  {sample}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="caption" className="flex-1" numberOfLines={1}>
            {block.summary ?? ''}
          </Text>
          <View className="flex-row items-center gap-1 rounded-full bg-accent px-4 py-2">
            <Text className="text-accent-foreground">{block.buttonLabel}</Text>
            <Icon name="chevron-right" size={16} directional colorClassName="accent-accent-foreground" />
          </View>
        </View>
      </Pressable>
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
