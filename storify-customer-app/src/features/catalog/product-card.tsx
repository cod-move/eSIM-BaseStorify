import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { AppImage } from '@/components/ui/app-image';
import { usePressScale } from '@/components/ui/press-motion';
import { Price } from '@/components/ui/price';
import { CompactRating } from '@/components/ui/rating';
import { Text } from '@/components/ui/text';
import type { ProductCard as ProductCardData } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import {
  CaptionLabels,
  CardLink,
  CartButton,
  CartSocket,
  PictureLabels,
  WishlistToggle,
  cardAction,
} from './product-card-parts';

/**
 * - `grid`: the white card with the round cart button in a socket at its picture's corner
 *   (product lists, Latest, Wishlist).
 * - `compact`: the same card without buttons and a size smaller, three across a
 *   phone (the Home showcase panels; the design calls it the mini card).
 * - `rail`: no card, the picture then name, price and rating (shelves that scroll).
 * - `plain`: the rail card without the rating (the tabbed shelves of Home).
 * - `row`: a small picture at the start, the rating at the end (search results,
 *   the tracking sheet, My reviews, the pinned bar).
 */
export type ProductCardVariant = 'grid' | 'compact' | 'rail' | 'plain' | 'row';

export type ProductCardProps = {
  /** What the list sent. The card shows these fields and decides nothing else. */
  product: ProductCardData;
  variant?: ProductCardVariant;
  /** The size and place of the card (`w-40`, `m-2 flex-1`). */
  className?: string;
  /** What a tap on the card does. It opens the product's page when left out. */
  onPress?: (product: ProductCardData) => void;
  /**
   * The grid card's round button: adds the product, or opens its options when
   * the store says one has to be chosen first (the button's words follow). The
   * button shows only when the product can be bought and this is given.
   */
  onAddToCart?: (product: ProductCardData) => void;
  /** The grid card's heart. It shows when this is given. */
  onToggleWishlist?: (product: ProductCardData) => void;
  isWishlisted?: boolean;
  /** The screen is working on this card's cart button: a spinner shows and it cannot be pressed. */
  busy?: boolean;
};

/** The shape of the grid card's picture well, measured from the design: a little taller than wide. */
const WELL_RATIO = 0.94;
/** The shape of the picture on a card with no frame. */
const RAIL_RATIO = 0.86;
/** A row spans the screen, so it gives less under the finger than a card. */
const ROW_PRESS_SCALE = 0.98;

/**
 * A product in a list, a rail or a panel, as the store described it. It fetches
 * nothing and it reads as one element to a screen reader: the name, the price,
 * the rating and the words over the picture, in that order. The cart button and
 * the heart are separate controls beside it.
 *
 * Only what the store sends is shown. A card has no category name, no units
 * sold and no discount label, so there are none; a price struck through is the
 * store's own compare-at price.
 */
export function ProductCard({
  product,
  variant = 'grid',
  className,
  onPress,
  onAddToCart,
  onToggleWishlist,
  isWishlisted = false,
  busy = false,
}: ProductCardProps) {
  const open = () =>
    onPress
      ? onPress(product)
      : router.push({ pathname: '/products/[slug]', params: { slug: product.slug } });

  switch (variant) {
    case 'grid': {
      const action = onAddToCart ? cardAction(product) : null;
      return (
        <GridCard
          product={product}
          className={className}
          open={open}
          action={action}
          busy={busy}
          onAddToCart={() => onAddToCart?.(product)}
          onToggleWishlist={onToggleWishlist ? () => onToggleWishlist(product) : undefined}
          isWishlisted={isWishlisted}
        />
      );
    }
    case 'compact':
      return <CompactCard product={product} className={className} open={open} />;
    case 'rail':
    case 'plain':
      return (
        <RailCard
          product={product}
          className={className}
          open={open}
          withRating={variant === 'rail'}
        />
      );
    case 'row':
      return <RowCard product={product} className={className} open={open} />;
  }
}

/** The price as the store sent it: the amount, the compare-at amount, "From", or "Price on request". */
function PriceOf({ product, size }: { product: ProductCardData; size: 'sm' | 'md' | 'card' }) {
  return (
    <Price
      price={product.price}
      compareAt={product.compareAtPrice}
      from={product.priceVaries}
      onRequest={product.priceOnRequest}
      size={size}
    />
  );
}

/** The grey well that holds the picture, with the words over it. */
function Well({
  product,
  ratio,
  className,
  children,
}: {
  product: ProductCardData;
  ratio: number;
  className: string;
  children?: ReactNode;
}) {
  return (
    <View
      className={cn('w-full overflow-hidden bg-surface-alt', className)}
      style={{ aspectRatio: ratio }}>
      {/* A margin around the picture, so a product never touches the well's edges. */}
      <AppImage
        image={product.image}
        size="card"
        contentFit="contain"
        className="size-full bg-surface-alt p-[6%]"
        decorative
      />
      <PictureLabels product={product} />
      {children}
    </View>
  );
}

type GridCardProps = {
  product: ProductCardData;
  className?: string;
  open: () => void;
  action: ReturnType<typeof cardAction>;
  busy: boolean;
  onAddToCart: () => void;
  onToggleWishlist?: () => void;
  isWishlisted: boolean;
};

function GridCard({
  product,
  className,
  open,
  action,
  busy,
  onAddToCart,
  onToggleWishlist,
  isWishlisted,
}: GridCardProps) {
  // The card gives under the finger as a whole, with the heart and the cart button on it.
  const press = usePressScale();
  const { scale } = press;
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View className={className} style={pressed}>
      <CardLink
        product={product}
        onPress={open}
        press={press}
        // It grows with a stretched parent, so cards in a row share one height. A thin rim of 4 pt
        // around the picture, whose corners follow the card's (14 − 4 = the picture's 10).
        className="grow rounded-lg border border-transparent bg-surface p-1 pb-3 shadow-card active:opacity-90 dark:border-border">
        <Well product={product} ratio={WELL_RATIO} className="rounded-md">
          {/* The socket: a smooth cut-out of the card's own colour that the round button sits in. */}
          {action ? <CartSocket /> : null}
        </Well>

        {/* The name on one line, then the price at the start and the rating at the end. */}
        <View className="grow justify-between gap-1 px-1.5 pt-2.5">
          <Text variant="product" className="text-[15px] leading-[20px]" numberOfLines={1}>
            {product.name}
          </Text>
          <View className="flex-row items-center justify-between gap-1">
            <View className="min-w-0 shrink">
              <PriceOf product={product} size="card" />
            </View>
            {product.rating ? <CompactRating rating={product.rating} /> : null}
          </View>
        </View>
      </CardLink>

      {/* The buttons sit over the picture but outside the link, so a tap on one never opens the product.
          This layer covers the picture exactly: inside the card's 1 pt border and 4 pt rim. */}
      {action || onToggleWishlist ? (
        <View
          pointerEvents="box-none"
          className="absolute start-[5px] end-[5px] top-[5px]"
          style={{ aspectRatio: WELL_RATIO }}>
          {onToggleWishlist ? (
            <View className="absolute end-2 top-2">
              <WishlistToggle product={product} active={isWishlisted} onPress={onToggleWishlist} />
            </View>
          ) : null}
          {action ? (
            <View className="absolute end-0 bottom-0">
              <CartButton product={product} action={action} busy={busy} onPress={onAddToCart} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Three of these fit across a phone, which is why the name and the price are 10 px. */
function CompactCard({
  product,
  className,
  open,
}: {
  product: ProductCardData;
  className?: string;
  open: () => void;
}) {
  return (
    <CardLink
      product={product}
      onPress={open}
      className={cn(
        'rounded-lg border border-transparent bg-surface p-1 pb-2 shadow-card active:opacity-90 dark:border-border',
        className
      )}>
      <Well product={product} ratio={WELL_RATIO} className="rounded-md" />
      <View className="gap-1 px-1 pt-2">
        <Text variant="product" className="text-[10px] leading-[13px]" numberOfLines={1}>
          {product.name}
        </Text>
        <View className="flex-row items-center justify-between gap-0.5">
          <View className="min-w-0 shrink">
            <PriceOf product={product} size="sm" />
          </View>
          {product.rating ? <CompactRating rating={product.rating} size="sm" /> : null}
        </View>
      </View>
    </CardLink>
  );
}

function RailCard({
  product,
  className,
  open,
  withRating,
}: {
  product: ProductCardData;
  className?: string;
  open: () => void;
  withRating: boolean;
}) {
  return (
    <CardLink product={product} onPress={open} className={cn('gap-2 active:opacity-80', className)}>
      <Well product={product} ratio={RAIL_RATIO} className="rounded-lg" />
      <View className="gap-1 px-0.5">
        <Text variant="product" numberOfLines={1}>
          {product.name}
        </Text>
        <View className="flex-row items-center justify-between gap-1">
          <View className="min-w-0 shrink">
            <PriceOf product={product} size="md" />
          </View>
          {withRating && product.rating ? <CompactRating rating={product.rating} /> : null}
        </View>
      </View>
    </CardLink>
  );
}

function RowCard({
  product,
  className,
  open,
}: {
  product: ProductCardData;
  className?: string;
  open: () => void;
}) {
  return (
    <CardLink
      product={product}
      onPress={open}
      scaleTo={ROW_PRESS_SCALE}
      className={cn('min-h-14 flex-row items-center gap-3 active:opacity-80', className)}>
      <AppImage
        image={product.image}
        size="thumb"
        contentFit="contain"
        className="size-14 rounded-md bg-surface-alt"
        decorative
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="subheading" numberOfLines={1}>
          {product.name}
        </Text>
        <CaptionLabels product={product} />
        <PriceOf product={product} size="md" />
      </View>
      {product.rating ? <CompactRating rating={product.rating} /> : null}
    </CardLink>
  );
}
