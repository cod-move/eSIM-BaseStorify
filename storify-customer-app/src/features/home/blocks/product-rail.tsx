import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { FlatList, View, type ViewToken } from 'react-native';

import { Text } from '@/components/ui/text';
import { EdgeFade } from '@/components/ui/edge-fade';
import type { ProductCard as ProductCardData, ProductRailBlock } from '@/contracts/mobile/shop/v1';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';
import { useOpenLink } from '@/features/config/use-open-link';

import { BlockTitle } from './block-title';

/** A card counts as seen when more than half of it is on screen for a moment. */
const SEEN = { itemVisiblePercentThreshold: 50, minimumViewTime: 400 } as const;

/**
 * What a card does when it is tapped, for a block that has to know about it
 * first (a paid card is reported as opened): the same page the card opens on
 * its own. `undefined` leaves the card to do it by itself.
 */
function useOpenProduct(onOpen?: (product: ProductCardData) => void) {
  const router = useRouter();
  if (!onOpen) return undefined;
  return (product: ProductCardData) => {
    onOpen(product);
    router.push({ pathname: '/products/[slug]', params: { slug: product.slug } });
  };
}

type ProductStripProps = {
  products: ProductCardData[];
  /** The space at the start and end of the row. */
  contentClassName?: string;
  /** A card came into view. Called again when the shopper scrolls it back. */
  onSeen?: (product: ProductCardData) => void;
  /** A card is about to open its page. */
  onOpen?: (product: ProductCardData) => void;
};

/** A row of product cards that scrolls sideways: the rail, the tabs and the paid rail draw theirs in it. */
export function ProductStrip({
  products,
  contentClassName = 'px-4',
  onSeen,
  onOpen,
}: ProductStripProps) {
  const open = useOpenProduct(onOpen);
  const cardActions = useCardActions();
  // The list wants one handler for as long as it lives, so it reads the latest through a ref.
  const seen = useRef(onSeen);
  useEffect(() => {
    seen.current = onSeen;
  }, [onSeen]);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const { item, isViewable } of viewableItems) {
        if (isViewable) seen.current?.(item as ProductCardData);
      }
    },
    []
  );

  return (
    <View>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(product) => product.id}
        showsHorizontalScrollIndicator={false}
        contentContainerClassName={`gap-3 ${contentClassName}`}
        viewabilityConfig={SEEN}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            variant="plain"
            className="w-[140px]"
            onPress={open}
            {...cardActions(item)}
          />
        )}
      />
      <EdgeFade />
    </View>
  );
}

export function ProductRail({ block }: { block: ProductRailBlock }) {
  const openLink = useOpenLink();
  const { href } = block;
  if (block.products.length === 0) return null;

  return (
    <View className="gap-3">
      {block.title ? (
        <View className="gap-1">
          <BlockTitle title={block.title} onViewAll={href ? () => openLink(href) : undefined} />
          {block.subtitle ? (
            <Text variant="caption" className="px-4">
              {block.subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      <ProductStrip products={block.products} />
    </View>
  );
}
