import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { useBottomSpace, useTabBarHeight, useTabBarTop } from '@/components/shell/tab-bar';
import { ActionTile, ActionTiles } from '@/components/ui/action-tile';
import { Divider } from '@/components/ui/divider';
import { Price } from '@/components/ui/price';
import { StarRating } from '@/components/ui/rating';
import { Text } from '@/components/ui/text';
import type { ProductDetail } from '@/contracts/mobile/shop/v1';
import { WishlistButton } from '@/features/catalog/wishlist-button';
import { AskSeller } from '@/features/chat/ask-seller';
import { CompareEntry, CompareTile } from '@/features/compare/compare-actions';
import { useConfig } from '@/features/config/use-config';
import { useRecordView } from '@/features/recently-viewed/use-record-view';

import { PinnedBar } from './pinned-bar';
import { ProductActions } from './product-actions';
import { ProductGallery } from './product-gallery';
import { pictureOfChoice } from './purchase-state';
import { ShareButton, SheetRows, openReviews } from './product-links';
import { ProductReviewEntry } from './product-review-entry';
import { ProductOptions } from './product-options';
import { ProductRails } from './product-rails';
import { ProductSeller } from './product-seller';
import { useProductSeller } from './use-product';
import { useProductPurchase } from './use-product-purchase';

/** The gap between the pinned bar and the floating tab bar under it. */
const PINNED_GAP = 6;
/** The space the pinned bar takes over the end of the page. */
const BAR_SPACE = 120;
/** How far into the paid rail the page must show before its cards count as seen. */
const SPONSORED_SEEN_AT = 120;

/**
 * The product page, from the top: the seller in the
 * header, the gallery, the name and heart, the rating, the price, the options
 * and quantity, the buy buttons, sharing, the rows that open the sheets,
 * and the rails. The pinned bar appears once the buy buttons have
 * scrolled away, so it never covers the options it depends on.
 */
export function ProductPage({ product }: { product: ProductDetail }) {
  const t = useTranslations('product');
  const features = useConfig().data?.features;
  const seller = useProductSeller(product);
  const purchase = useProductPurchase(product);
  useRecordView(product.id);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  // Where the pinned bar stands: just above the floating tab bar, or at the bottom over no bar.
  const tabBarTop = useTabBarTop();
  const pinnedBottom = tabBarTop > 0 ? tabBarTop + PINNED_GAP : 0;
  const bottomSpace = useBottomSpace();
  const scroll = useRef<ScrollView>(null);
  const [optionsTop, setOptionsTop] = useState(0);
  const [actionsBottom, setActionsBottom] = useState(Number.POSITIVE_INFINITY);
  const [pinned, setPinned] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [railsTop, setRailsTop] = useState(0);
  const [sponsoredTop, setSponsoredTop] = useState<number | null>(null);
  const [scrolledToSponsored, setScrolledToSponsored] = useState(false);

  // The paid rail is in view once its first half is on screen.
  const sponsoredLine = sponsoredTop === null ? null : railsTop + sponsoredTop + SPONSORED_SEEN_AT;
  const sponsoredInView =
    scrolledToSponsored || (sponsoredLine !== null && viewportHeight > sponsoredLine);

  // The gallery slides to the picture of what is picked: the variant's, or a colour's before the size.
  const focus = purchase.variant?.image ?? pictureOfChoice(product, purchase.choice);

  const openSeller = seller ? () => router.push(seller.href) : undefined;
  const showRating = Boolean(features?.reviews && product.rating);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: product.name,
          // The seller (or brand) beside the way back; the route drops the line under the header.
          headerTitleAlign: 'left',
          headerTitle: () =>
            seller ? <ProductSeller vendor={seller} onPress={openSeller} /> : null,
        }}
      />
      <ScrollView
        ref={scroll}
        scrollEventThrottle={32}
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        onScroll={(event) => {
          const { y } = event.nativeEvent.contentOffset;
          const next = y > actionsBottom;
          if (next !== pinned) setPinned(next);
          if (!sponsoredInView && sponsoredLine !== null && y + viewportHeight > sponsoredLine) {
            setScrolledToSponsored(true);
          }
        }}
        contentContainerStyle={{
          paddingBottom: (pinned ? BAR_SPACE : 32) + bottomSpace,
        }}
        contentContainerClassName="gap-4 pt-2">
        <ProductGallery images={product.images} focus={focus} />

        <View className="gap-3 px-4">
          <View className="flex-row items-start gap-3">
            <Text variant="title-large" className="flex-1">
              {product.name}
            </Text>
            {features?.wishlist ? <WishlistButton productId={product.id} /> : null}
          </View>

          {showRating && product.rating ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => openReviews(product.slug)}
              className="min-h-11 justify-center self-start active:opacity-70">
              <StarRating rating={product.rating} />
            </Pressable>
          ) : null}

          <Price
            price={purchase.price}
            compareAt={purchase.compareAtPrice}
            from={purchase.from}
            onRequest={product.priceOnRequest}
            size="lg"
          />
        </View>

        <View
          className="px-4"
          onLayout={(event: LayoutChangeEvent) => setOptionsTop(event.nativeEvent.layout.y)}>
          <Divider />
          <ProductOptions
            product={product}
            choice={purchase.choice}
            onChoose={purchase.choose}
            quantity={purchase.quantity}
            onQuantity={purchase.setQuantity}
            maxQuantity={purchase.maxQuantity}
          />
        </View>

        <View
          className="px-4"
          onLayout={(event: LayoutChangeEvent) => {
            const { y, height } = event.nativeEvent.layout;
            setActionsBottom(y + height);
          }}>
          <ProductActions purchase={purchase} />
        </View>

        <ActionTiles className="px-4">
          <ShareButton product={product} />
          <CompareTile product={product} />
          <AskSeller product={product} variantId={purchase.variant?.id} />
          {seller ? (
            <ActionTile
              icon="store"
              label={t('visit', { seller: seller.name })}
              onPress={() => router.push(seller.href)}
            />
          ) : null}
        </ActionTiles>

        {/* Once something is picked to compare, the way to the comparison. */}
        <CompareEntry />

        <View className="px-4">
          {features?.reviews ? <ProductReviewEntry slug={product.slug} className="mb-2" /> : null}
          <SheetRows product={product} reviews={Boolean(features?.reviews)} />
        </View>

        <View onLayout={(event: LayoutChangeEvent) => setRailsTop(event.nativeEvent.layout.y)}>
          <ProductRails
            product={product}
            sponsoredInView={sponsoredInView}
            onSponsoredTop={setSponsoredTop}
          />
        </View>
      </ScrollView>

      {pinned ? (
        // The pinned bar stands on the tab bar, clear of its fade. It is then
        // not at the screen's edge, so it keeps no room for the home indicator.
        // Its frame is the bar's own height, so the page above it stays touchable.
        // It fades in rising into place when the buy buttons scroll away, and drops out when they
        // return. It sits just above the floating tab bar, a small gap between them.
        <Animated.View
          entering={FadeInDown.duration(260).easing(Easing.out(Easing.cubic))}
          exiting={FadeOutDown.duration(180)}
          className="absolute inset-x-0"
          style={{ bottom: pinnedBottom }}>
          <SafeAreaInsetsContext.Provider value={tabBarHeight ? { ...insets, bottom: 0 } : insets}>
            <PinnedBar
              product={product}
              purchase={purchase}
              onShowOptions={() => scroll.current?.scrollTo({ y: optionsTop, animated: true })}
            />
          </SafeAreaInsetsContext.Provider>
        </Animated.View>
      ) : null}
    </View>
  );
}
