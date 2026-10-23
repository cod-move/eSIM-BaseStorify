import { QueryClientContext } from '@tanstack/react-query';
import { useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, Pressable, View, type PressableProps } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { withUniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { Icon, type IconTint } from '@/components/ui/icon';
import {
  AnimatedPressable,
  PressableScale,
  ROUND_PRESS_SCALE,
  pop,
  usePressScale,
} from '@/components/ui/press-motion';
import { Text } from '@/components/ui/text';
import {
  SetCartLineRequest,
  type ProductCard as ProductCardData,
} from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

/** What the round button of a card does: put the product in the cart, or ask which one first. */
export type CardAction = 'add' | 'options';

/**
 * Which button a card offers, from the fields the store sent and nothing else.
 * Out of stock, sold by quote and not for sale inside an app (digital goods)
 * get none; a pre-order can be bought, so it gets the same button as stock.
 */
export function cardAction(product: ProductCardData): CardAction | null {
  if (product.availability === 'OUT_OF_STOCK') return null;
  if (product.priceOnRequest || !product.purchasableInApp) return null;
  return product.requiresVariantChoice ? 'options' : 'add';
}

/** The availability a card says in words. In stock says nothing. */
export function cardAvailability(product: ProductCardData): 'outOfStock' | 'preOrder' | null {
  if (product.availability === 'OUT_OF_STOCK') return 'outOfStock';
  if (product.availability === 'PRE_ORDER') return 'preOrder';
  return null;
}

/**
 * The words over a card's picture: the availability at the top, and at the
 * bottom "Sponsored", which a paid placement must always carry.
 */
export function PictureLabels({ product }: { product: ProductCardData }) {
  const t = useTranslations('catalog');
  const availability = cardAvailability(product);

  return (
    <>
      {availability ? (
        <View
          className={cn(
            'absolute start-2 top-2 rounded-full px-2 py-0.5',
            availability === 'preOrder' ? 'bg-accent' : 'bg-foreground'
          )}>
          <Text
            variant="badge"
            className={availability === 'preOrder' ? 'text-accent-foreground' : 'text-background'}>
            {t(availability)}
          </Text>
        </View>
      ) : null}
      {product.sponsored ? (
        <View className="absolute start-2 bottom-2 rounded-full bg-surface px-2 py-0.5">
          <Text variant="badge" className="text-muted">
            {t('sponsored')}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/** The same words as a line of captions, for the row that has no big picture to put them on. */
export function CaptionLabels({ product }: { product: ProductCardData }) {
  const t = useTranslations('catalog');
  const availability = cardAvailability(product);
  if (!availability && !product.sponsored) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-x-2">
      {product.sponsored ? <Text variant="caption">{t('sponsored')}</Text> : null}
      {availability ? (
        <Text variant="caption" className="font-semibold text-foreground">
          {t(availability)}
        </Text>
      ) : null}
    </View>
  );
}

type CartButtonProps = {
  product: ProductCardData;
  action: CardAction;
  /** The screen is adding this product: a spinner takes the cart's place. */
  busy: boolean;
  onPress: () => void;
};

/** The cart button's size: it sits in the socket at the corner of the card's picture. */
const CART_BUTTON = 30;
/** How long the check stays once the store has said yes, before the cart comes back. */
const ADDED_MS = 1200;
/** How far the button swells when the product goes into the cart. */
const ADDED_BUMP = 1.22;
/** A face of the cart button (the cart, the spinner, the check) growing in from small, with a little overshoot. */
const FACE_IN = { stiffness: 380, damping: 16, mass: 1 } as const;
/** The check turns into place as it grows. */
const CHECK_TURN = -45;

/**
 * How many times the store has just said yes to an add this card started,
 * back to 0 once the check has been shown long enough.
 *
 * The screen tells the card only that it is busy with the product. How the
 * request ended is in the query client's record of it, which the card listens
 * to while it is busy (it asks the store nothing itself): a request that sets
 * this product's line and succeeds. Without a query client (the kit gallery)
 * nothing is heard and no check is shown; a refusal shows none either.
 */
export function useAddedToCart(productId: string, busy: boolean): number {
  const client = useContext(QueryClientContext);
  const adding = useRef(busy);
  const [added, setAdded] = useState(0);

  useEffect(() => {
    adding.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!client) return;
    return client.getMutationCache().subscribe((event) => {
      if (!adding.current || event.type !== 'updated' || event.action.type !== 'success') return;
      const line = SetCartLineRequest.safeParse(event.mutation.state.variables);
      if (line.success && line.data.productId === productId) setAdded((count) => count + 1);
    });
  }, [client, productId]);

  useEffect(() => {
    if (added === 0) return;
    const timer = setTimeout(() => setAdded(0), ADDED_MS);
    return () => clearTimeout(timer);
  }, [added]);

  return added;
}

/** One face of the cart button: it grows in when `shown` turns on and shrinks away when it turns off. */
function useFace(shown: boolean, turn = 0) {
  const progress = useSharedValue(shown ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(shown ? 1 : 0, FACE_IN);
  }, [shown, progress]);

  return useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(progress.value, 0), 1),
    transform: [
      { scale: 0.4 + 0.6 * progress.value },
      { rotate: `${turn * (1 - progress.value)}deg` },
    ],
  }));
}

/**
 * The round cart button in the socket of a grid card. It sits outside the
 * card's link, so a tap on it never opens the product. Its picture is 30 pt
 * and its touch area 44.
 *
 * It gives under the finger. While the screen adds the product a spinner grows
 * in place of the cart; when the store says yes the button swells and shows a
 * check for a moment, then the cart grows back.
 */
export function CartButton({ product, action, busy, onPress }: CartButtonProps) {
  const t = useTranslations('product');
  const press = usePressScale(ROUND_PRESS_SCALE);
  const { scale } = press;
  const bump = useSharedValue(1);
  const added = useAddedToCart(product.id, busy);
  const checked = added > 0 && !busy;

  useEffect(() => {
    if (added > 0) bump.value = pop(ADDED_BUMP);
  }, [added, bump]);

  const body = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * bump.value }] }));
  const cart = useFace(!busy && !checked);
  const spinner = useFace(busy);
  const check = useFace(checked, CHECK_TURN);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={action === 'options' ? t('chooseOptions') : t('addToCart')}
      accessibilityHint={product.name}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={7}
      // Black in both themes, as the design draws it, whatever the store's brand colour.
      className="size-[30px] items-center justify-center rounded-full bg-scrim active:opacity-80"
      style={body}>
      <Animated.View style={cart}>
        <Icon name="cart-plus" size={15} strokeWidth={2.2} colorClassName="accent-on-scrim" />
      </Animated.View>
      <Animated.View
        className="pointer-events-none absolute inset-0 items-center justify-center"
        style={check}>
        <Icon name="check" size={16} strokeWidth={2.6} colorClassName="accent-on-scrim" />
      </Animated.View>
      {busy ? (
        <Animated.View
          className="pointer-events-none absolute inset-0 items-center justify-center"
          style={spinner}>
          <ActivityIndicator size="small" colorClassName="accent-on-scrim" />
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}

/** How far the socket's edge stands off the cart button. */
const SOCKET_GAP = 5;
/** The radius of the curves where the socket's edge meets the picture's edges. */
const SOCKET_FILLET = 7;

/**
 * The socket's outline, in a square whose bottom-end corner is the corner of
 * the picture (drawn for left to right; the socket mirrors itself).
 *
 * A circle `SOCKET_GAP` wider than the button, around the button's centre,
 * runs into the picture's bottom and end edges through two small curves, so
 * the cut-out has no corner anywhere. Each curve is a circle of radius
 * `SOCKET_FILLET` that touches the picture's edge and the socket's circle.
 */
function socketPath(): { size: number; path: string } {
  const centre = CART_BUTTON / 2;
  const radius = centre + SOCKET_GAP;
  const fillet = SOCKET_FILLET;
  // How far along the edge a curve's centre is from the button's centre: the two circles touch.
  const along = Math.sqrt((radius + fillet) ** 2 - (centre - fillet) ** 2);
  const size = centre + along;
  const c = size - centre;
  const touch = radius / (radius + fillet);
  const at = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  // The curve on the bottom edge, and the one on the end edge.
  const bottom = { x: c - along, y: size - fillet };
  const end = { x: size - fillet, y: c - along };

  const path = [
    `M ${at(bottom.x, size)}`,
    `A ${fillet} ${fillet} 0 0 0 ${at(c + (bottom.x - c) * touch, c + (bottom.y - c) * touch)}`,
    `A ${radius} ${radius} 0 0 1 ${at(c + (end.x - c) * touch, c + (end.y - c) * touch)}`,
    `A ${fillet} ${fillet} 0 0 0 ${at(size, end.y)}`,
    `L ${at(size, size)}`,
    'Z',
  ].join(' ');
  return { size, path };
}

const SOCKET = socketPath();

// The socket takes the card's colour from a token, as the icons do.
const TokenSvg = withUniwind(Svg);

/**
 * The smooth cut-out at the bottom-end corner of a grid card's picture that
 * the cart button sits in: drawn over the picture in the card's own colour,
 * so it reads as part of the card in either theme.
 */
export function CartSocket() {
  // On a phone Uniwind gives the SVG the token as its colour; a browser takes the text colour.
  const colour =
    Platform.OS === 'web'
      ? { className: 'text-surface rtl:-scale-x-100' }
      : { colorClassName: 'accent-surface', className: 'rtl:-scale-x-100' };

  return (
    <View className="pointer-events-none absolute end-0 bottom-0">
      <TokenSvg
        width={SOCKET.size}
        height={SOCKET.size}
        viewBox={`0 0 ${SOCKET.size} ${SOCKET.size}`}
        {...colour}>
        <Path d={SOCKET.path} fill="currentColor" />
      </TokenSvg>
    </View>
  );
}

/** A filled heart in the store's sale colour (the cards) or its danger colour (the product page). */
const HEART_TONES = {
  sale: { tint: 'accent-sale', ring: 'border-sale' },
  danger: { tint: 'accent-danger', ring: 'border-danger' },
} as const satisfies Record<string, { tint: IconTint; ring: string }>;

/** How far the heart swells when it is chosen, and shrinks when it is let go. */
const HEART_POP = 1.35;
const HEART_SHRINK = 0.8;
/** The fill growing out of the middle of the heart. */
const FILL_IN = { stiffness: 420, damping: 18, mass: 1 } as const;
const FILL_OUT = { duration: 160 } as const;
/** The ring that bursts out of a heart as it fills. */
const BURST = { duration: 520, easing: Easing.out(Easing.cubic) } as const;

type HeartButtonProps = Pick<
  PressableProps,
  'accessibilityLabel' | 'accessibilityHint' | 'accessibilityState' | 'hitSlop' | 'className'
> & {
  active: boolean;
  onPress: () => void;
  iconSize: number;
  tone: keyof typeof HEART_TONES;
  /** The outline's colour while the heart is empty. */
  idleTint: IconTint;
};

/**
 * A wishlist heart that answers a tap. Chosen, it swells, fills from the
 * middle and sends a ring out; let go, it empties and shrinks back. A change
 * that does not follow a tap (the wishlist arriving) just shows.
 */
export function HeartButton({
  active,
  onPress,
  iconSize,
  tone,
  idleTint,
  ...props
}: HeartButtonProps) {
  const press = usePressScale(ROUND_PRESS_SCALE);
  const { scale } = press;
  const beat = useSharedValue(1);
  const fill = useSharedValue(active ? 1 : 0);
  const burst = useSharedValue(1);
  const tapped = useRef(false);

  useEffect(() => {
    if (!tapped.current) {
      fill.value = active ? 1 : 0;
      return;
    }
    tapped.current = false;
    if (active) {
      fill.value = withSpring(1, FILL_IN);
      beat.value = pop(HEART_POP);
      burst.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, BURST));
    } else {
      fill.value = withTiming(0, FILL_OUT);
      beat.value = pop(HEART_SHRINK);
    }
  }, [active, beat, burst, fill]);

  const body = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * beat.value }] }));
  const solid = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(fill.value, 0), 1),
    transform: [{ scale: 0.3 + 0.7 * fill.value }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - burst.value),
    transform: [{ scale: 0.7 + 0.9 * burst.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...props}
      onPress={() => {
        tapped.current = true;
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={body}>
      <Animated.View
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full border-2',
          HEART_TONES[tone].ring
        )}
        style={ring}
      />
      <Icon name="heart" size={iconSize} colorClassName={idleTint} />
      <Animated.View
        className="pointer-events-none absolute inset-0 items-center justify-center"
        style={solid}>
        <Icon name="heart" size={iconSize} filled colorClassName={HEART_TONES[tone].tint} />
      </Animated.View>
    </AnimatedPressable>
  );
}

type WishlistToggleProps = {
  product: ProductCardData;
  active: boolean;
  onPress: () => void;
};

/** The heart on the top corner of a grid card: outside the link, 30 pt to look at, 44 to touch. */
export function WishlistToggle({ product, active, onPress }: WishlistToggleProps) {
  const t = useTranslations('product');

  return (
    <HeartButton
      accessibilityLabel={active ? t('removeFromWishlist') : t('addToWishlist')}
      accessibilityHint={product.name}
      active={active}
      onPress={onPress}
      iconSize={16}
      tone="sale"
      idleTint="accent-muted"
      hitSlop={7}
      className="size-[30px] items-center justify-center rounded-full border border-border bg-surface active:opacity-80"
    />
  );
}

/**
 * What a screen reader says after the product's name: the labels, the price and
 * the rating, in the order they are drawn. The name stays the link's label, so
 * that it is what the link is called.
 */
function useSpokenDetails(product: ProductCardData): string {
  const t = useTranslations('catalog');
  const reviews = useTranslations('product');
  const availability = cardAvailability(product);
  const parts: string[] = [];

  if (product.sponsored) parts.push(t('sponsored'));
  if (availability) parts.push(t(availability));
  if (product.price) {
    parts.push(
      product.priceVaries ? t('from', { price: product.price.formatted }) : product.price.formatted
    );
  } else if (product.priceOnRequest) {
    parts.push(t('priceOnRequest'));
  }
  if (product.rating) {
    const count = reviews('reviews', { count: product.rating.count });
    parts.push(`${product.rating.average}, ${count}`);
  }
  return parts.join('. ');
}

type CardLinkProps = PropsWithChildren<{
  product: ProductCardData;
  onPress: () => void;
  className?: string;
  /**
   * The press of a card that gives as a whole, buttons and all (the grid
   * card): the link reports its touches and the card draws the give. Without
   * it the link gives by itself.
   */
  press?: { onPressIn: () => void; onPressOut: () => void };
  /** How far the link gives by itself: less for a wide row. */
  scaleTo?: number;
}>;

/**
 * The card as one link: a screen reader stops once, on the name, and hears the
 * rest as its value. The cart button and the heart are not inside it. It gives
 * under the finger and springs back.
 */
export function CardLink({ product, onPress, className, press, scaleTo, children }: CardLinkProps) {
  const details = useSpokenDetails(product);
  const link = {
    accessibilityRole: 'link',
    accessibilityLabel: product.name,
    accessibilityValue: { text: details },
    onPress,
    className,
  } as const;

  return press ? (
    <Pressable {...link} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      {children}
    </Pressable>
  ) : (
    <PressableScale {...link} scaleTo={scaleTo}>
      {children}
    </PressableScale>
  );
}
