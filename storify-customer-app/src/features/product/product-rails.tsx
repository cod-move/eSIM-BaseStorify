import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { FlatList, View, type LayoutChangeEvent, type ViewToken } from 'react-native';
import { useTranslations } from 'use-intl';

import { SectionHeader } from '@/components/ui/section-header';
import { EdgeFade } from '@/components/ui/edge-fade';
import { Text } from '@/components/ui/text';
import type { ProductCard as ProductCardData, ProductDetail } from '@/contracts/mobile/shop/v1';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';
import { useSponsoredEvents } from '@/features/home/sponsored-events';

/** A card counts as seen when more than half of it is on screen for a moment. */
const SEEN = { itemVisiblePercentThreshold: 50, minimumViewTime: 400 } as const;

type ProductRailsProps = {
  product: ProductDetail;
  /** Whether the page has scrolled the paid rail into view. */
  sponsoredInView: boolean;
  /** Where the paid rail starts, from the top of these rails. */
  onSponsoredTop: (y: number) => void;
};

/**
 * The rails at the end of the product page: the store's related products, and
 * "You may also like", which holds paid placements and says so. The
 * paid cards are reported to the store as seen and opened.
 */
export function ProductRails({ product, sponsoredInView, onSponsoredTop }: ProductRailsProps) {
  const t = useTranslations('product');
  const events = useSponsoredEvents('PRODUCT_PAGE');
  const category = product.category;

  // A rail sideways knows which of its cards fit across, not whether the page
  // has reached it: those cards wait until the page scrolls the rail into view.
  const inView = useRef(sponsoredInView);
  const waiting = useRef(new Map<string, ProductCardData>());
  useEffect(() => {
    inView.current = sponsoredInView;
    if (!sponsoredInView) return;
    for (const card of waiting.current.values()) events.seen(card);
    waiting.current.clear();
  }, [sponsoredInView, events]);

  const seen = useCallback(
    (card: ProductCardData) => {
      if (inView.current) events.seen(card);
      else waiting.current.set(card.id, card);
    },
    [events]
  );
  const open = useCallback(
    (card: ProductCardData) => {
      events.opened(card);
      router.push({ pathname: '/products/[slug]', params: { slug: card.slug } });
    },
    [events]
  );

  return (
    <View className="gap-6">
      {product.related.length > 0 ? (
        <Rail
          title={t('related')}
          products={product.related}
          onViewAll={
            category
              ? () => router.push({ pathname: '/products', params: { category: category.slug } })
              : undefined
          }
        />
      ) : null}
      {product.sponsoredRail.length > 0 ? (
        <View onLayout={(event: LayoutChangeEvent) => onSponsoredTop(event.nativeEvent.layout.y)}>
          <Rail
            title={t('youMayLike')}
            note={t('includesSponsored')}
            products={product.sponsoredRail}
            onSeen={seen}
            onOpen={open}
          />
        </View>
      ) : null}
    </View>
  );
}

type RailProps = {
  title: string;
  note?: string;
  products: ProductCardData[];
  onViewAll?: () => void;
  onSeen?: (product: ProductCardData) => void;
  onOpen?: (product: ProductCardData) => void;
};

function Rail({ title, note, products, onViewAll, onSeen, onOpen }: RailProps) {
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
    <View className="gap-3">
      <View className="gap-0.5 px-4">
        <SectionHeader title={title} onViewAll={onViewAll} />
        {note ? (
          <Text variant="caption" className="text-muted">
            {note}
          </Text>
        ) : null}
      </View>
      <View>
        <FlatList
          horizontal
          data={products}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
          viewabilityConfig={onSeen ? SEEN : undefined}
          onViewableItemsChanged={onSeen ? onViewableItemsChanged : undefined}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              variant="rail"
              className="w-36"
              onPress={onOpen}
              {...cardActions(item)}
            />
          )}
        />
        <EdgeFade />
      </View>
    </View>
  );
}
