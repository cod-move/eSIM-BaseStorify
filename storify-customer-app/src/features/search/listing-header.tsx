import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useTranslations } from 'use-intl';

import { transparentOf } from '@/components/shell/fade-color';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { BrandDetail, CollectionDetail, ImageSet } from '@/contracts/mobile/shop/v1';

/** The cover's height under the status bar: the screen's header and the title's room under it. */
const COVER_HEIGHT = 220;

type ListingHeaderProps = {
  title: string;
  image: ImageSet | undefined;
  /** A short line under the title: how many products. */
  facts: ReactNode;
  description?: string;
};

/**
 * What a list of one brand's or collection's products starts with:
 * its picture, its name, a line of facts and its description, as the store
 * sent them.
 */
function ListingHeader({ title, image, facts, description }: ListingHeaderProps) {
  return (
    <View className="gap-3 px-4 pt-4 pb-2">
      <View className="flex-row items-center gap-4">
        <AppImage
          image={image}
          size="thumb"
          contentFit="contain"
          className="size-16 rounded-xl bg-surface"
          decorative
        />
        <View className="flex-1 gap-1">
          <Text variant="heading" accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          {facts}
        </View>
      </View>
      {description ? (
        <Text className="text-muted" numberOfLines={3}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

function ProductCount({ count, className }: { count: number; className?: string }) {
  const t = useTranslations('search');
  return (
    <Text variant="caption" className={className}>
      {t('productCount', { count })}
    </Text>
  );
}

export function BrandHeader({ brand }: { brand: BrandDetail }) {
  return (
    <ListingHeader
      title={brand.name}
      image={brand.logo}
      facts={<ProductCount count={brand.productCount} />}
      description={brand.description}
    />
  );
}

/**
 * A collection's page starts with its picture as a cover, full width and under the screen's
 * header (which is transparent over it), with the title and the count on a shade at its foot.
 * A collection without a picture starts like a brand.
 */
export function CollectionHeader({ collection }: { collection: CollectionDetail }) {
  const insets = useSafeAreaInsets();
  const scrim = String(useCSSVariable('--color-scrim') ?? '');

  if (!collection.image) {
    return (
      <ListingHeader
        title={collection.title}
        image={collection.image}
        facts={<ProductCount count={collection.productCount} />}
        description={collection.description}
      />
    );
  }

  return (
    <View>
      <View
        style={{ height: insets.top + COVER_HEIGHT }}
        className="overflow-hidden bg-surface-alt">
        <AppImage
          image={collection.image}
          size="full"
          contentFit="cover"
          className="absolute inset-0 bg-transparent"
          decorative
        />
        {/* A shade from the middle down, so the words read on any picture. */}
        <LinearGradient
          colors={[transparentOf(scrim), scrim]}
          start={{ x: 0.5, y: 0.35 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.65 }]}
        />
        <View className="absolute inset-x-0 bottom-0 gap-1 px-4 pb-4">
          <Text
            variant="display"
            accessibilityRole="header"
            className="text-on-scrim"
            numberOfLines={2}>
            {collection.title}
          </Text>
          <ProductCount count={collection.productCount} className="text-on-scrim opacity-80" />
        </View>
      </View>
      {collection.description ? (
        <Text className="px-4 pt-3 text-muted" numberOfLines={3}>
          {collection.description}
        </Text>
      ) : null}
    </View>
  );
}
