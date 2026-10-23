import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

import type { BrandTile } from './use-browse';

type BrandTilesProps = {
  brands: BrandTile[];
  /** The brand the list is narrowed to, if any. */
  chosen?: string;
  /** Narrows the list to a brand, or widens it again when the chosen one is tapped. */
  onChoose: (slug: string | undefined) => void;
};

/**
 * The listing's brands as white tiles with the logo alone, scrolling sideways.
 * The brand's name is the tile's screen-reader label; it is printed
 * only for a brand that has no logo, so no tile is empty. The tiles stay white in
 * dark mode: most logos are dark on transparent. Shown only when
 * the list holds more than one brand: a single one narrows nothing. Stores
 * upload logos as square pictures with the wordmark across the middle, so the
 * logo box is square and as tall as the tile allows: in a wide, short box the logo
 * would shrink to the box's height.
 */
export function BrandTiles({ brands, chosen, onChoose }: BrandTilesProps) {
  if (brands.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3 px-4 py-4">
      {brands.map((brand) => {
        const selected = brand.slug === chosen;
        return (
          <BrandTileButton
            key={brand.slug}
            brand={brand}
            selected={selected}
            onPress={() => onChoose(selected ? undefined : brand.slug)}
          />
        );
      })}
    </ScrollView>
  );
}

type BrandTileButtonProps = {
  brand: BrandTile;
  selected?: boolean;
  onPress: () => void;
  /** Where the tile is laid out; its size is the default. */
  className?: string;
  /** The role the tile announces: a filter chip is a button, a brand in a list a link. */
  role?: 'button' | 'link';
};

/** One white tile with the brand's logo, or its name when it has none. */
export function BrandTileButton({
  brand,
  selected = false,
  onPress,
  className,
  role = 'button',
}: BrandTileButtonProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={brand.name}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'h-[57px] w-[76px] items-center justify-center rounded-2xl bg-logo-tile p-0.5 active:opacity-80',
        className
      )}>
      {brand.logo?.thumb ? (
        <AppImage
          image={brand.logo}
          size="thumb"
          contentFit="contain"
          className="size-full bg-transparent"
          decorative
        />
      ) : (
        <Text variant="chip" className="text-center leading-4 text-scrim" numberOfLines={2}>
          {brand.name}
        </Text>
      )}
      {selected ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 rounded-2xl border-2 border-primary"
        />
      ) : null}
    </Pressable>
  );
}

type BrandGridProps = {
  brands: BrandTile[];
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  loadingMore: boolean;
};

/**
 * Every brand of the store as tiles in three columns, with the name under each, and
 * pull to refresh; the bottom clears the tab bar. A tap opens the brand's page.
 */
export function BrandGrid({
  brands,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore,
}: BrandGridProps) {
  const router = useRouter();
  const bottom = useTabBarHeight();

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={brands}
        numColumns={3}
        keyExtractor={(brand) => brand.slug}
        renderItem={({ item }) => (
          <View className="flex-1 items-center gap-1.5 p-2">
            <BrandTileButton
              brand={item}
              role="link"
              className="w-full"
              onPress={() =>
                router.push({ pathname: '/brands/[slug]', params: { slug: item.slug } })
              }
            />
            <Text variant="caption" className="text-center" numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        )}
        contentContainerStyle={{ padding: 8, paddingBottom: bottom + 16 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListFooterComponent={
          loadingMore ? (
            <View className="p-4">
              <ActivityIndicator colorClassName="accent-muted" />
            </View>
          ) : null
        }
      />
    </View>
  );
}
