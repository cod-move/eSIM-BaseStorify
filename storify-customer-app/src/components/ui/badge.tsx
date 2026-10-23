import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useFormatter, useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { pop } from './press-motion';
import { Text } from './text';

/** The most a count badge spells out; more shows as "99+". */
const COUNT_BADGE_MAX = 99;

/**
 * What a count badge shows: nothing at zero (an empty cart has no badge), the
 * count up to `max`, then `max` with a plus.
 */
export function badgeCount(
  count: number,
  max = COUNT_BADGE_MAX
): { value: number; more: boolean } | null {
  if (!(count > 0)) return null;
  return count > max ? { value: max, more: true } : { value: count, more: false };
}

const COUNT_TONES = {
  /** The cart's count. */
  link: 'bg-link',
  /** Unread notifications and messages (Account header). */
  danger: 'bg-danger',
  /** A count on a dark tile (Account, "Promos"). */
  primary: 'bg-primary',
} as const;

type CountBadgeProps = {
  count: number;
  max?: number;
  tone?: keyof typeof COUNT_TONES;
  className?: string;
};

/** How far a badge swells when its number changes. */
const BOUNCE_PEAK = 1.3;
/** A badge appearing from nothing overshoots a little, then settles. */
const POP_IN = { stiffness: 420, damping: 14, mass: 1 } as const;

/**
 * The badge's scale: it bounces when the count changes, and pops in from
 * nothing when the count leaves zero. A badge that is already counting when
 * it is first drawn (a new screen's header) stays still.
 */
function useCountMotion(count: number) {
  const scale = useSharedValue(count > 0 ? 1 : 0);
  const before = useRef(count);

  useEffect(() => {
    const previous = before.current;
    before.current = count;
    // Hidden: kept at nothing, so the next count grows out of it without a frame at full size.
    if (!(count > 0)) {
      scale.value = 0;
      return;
    }
    if (count === previous) return;
    scale.value = previous > 0 ? pop(BOUNCE_PEAK) : withSpring(1, POP_IN);
  }, [count, scale]);

  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/**
 * A small round count: the cart's lines, unread notifications. It draws
 * nothing at zero. Place it with `className` (`absolute -end-1 -top-1`).
 *
 * The number is read as part of the control it sits on, so that control's
 * label carries the count for a screen reader.
 */
export function CountBadge({ count, max, tone = 'link', className }: CountBadgeProps) {
  const t = useTranslations('catalog');
  const format = useFormatter();
  const motion = useCountMotion(count);
  const shown = badgeCount(count, max);
  if (!shown) return null;

  const value = format.number(shown.value);
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(
        'h-[18px] min-w-[18px] items-center justify-center rounded-full px-1',
        COUNT_TONES[tone],
        className
      )}
      style={motion}>
      {/* `background` on the fill: near white in light mode, and dark enough on the lighter dark-mode fills. */}
      <Text variant="badge" className="text-center text-background">
        {shown.more ? t('countMore', { count: value }) : value}
      </Text>
    </Animated.View>
  );
}

/**
 * How a status looks. The colour is a second
 * signal: the badge always carries the status in words.
 */
const STATUS_TONES = {
  /** On its way to the shopper: pending, processing, shipped. */
  progress: { box: 'bg-accent border-accent', label: 'text-accent-foreground' },
  /** Finished well: delivered. */
  done: { box: 'border-border', label: 'text-muted' },
  /** Stopped: cancelled, refunded. */
  stopped: { box: 'border-danger', label: 'text-danger' },
  /** Waiting for stock: a pre-order. */
  preorder: { box: 'border-accent', label: 'text-accent' },
  /** A status the app does not know. */
  neutral: { box: 'bg-surface-alt border-surface-alt', label: 'text-foreground' },
} as const;

export type StatusTone = keyof typeof STATUS_TONES;

/** The statuses the app has a tone and a word for. */
const KNOWN_STATUSES = {
  pending: 'progress',
  processing: 'progress',
  shipped: 'progress',
  delivered: 'done',
  cancelled: 'stopped',
  refunded: 'stopped',
  preordered: 'preorder',
} as const satisfies Record<string, StatusTone>;

export type KnownStatus = keyof typeof KNOWN_STATUSES;

/** A known status by the way it is spelled once case, spaces and dashes are gone. */
const SPELLINGS = new Map<string, KnownStatus>([
  ...(Object.keys(KNOWN_STATUSES) as KnownStatus[]).map((status) => [status, status] as const),
  ['canceled', 'cancelled'],
  ['preorder', 'preordered'],
]);

/**
 * What the app makes of a status as the store sends it. The status is free
 * text: a store may send one the app has never heard of, so a known status
 * gets its tone and its word (`known`), and any other is shown as the store
 * wrote it (`text`, with the underscores and dashes of a code taken out) on a
 * neutral badge.
 */
export function describeStatus(status: string): {
  tone: StatusTone;
  known: KnownStatus | null;
  text: string;
} {
  const spelled = status
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  const known = SPELLINGS.get(spelled) ?? null;
  const words = status.trim().replace(/[_-]+/g, ' ');
  return {
    tone: known ? KNOWN_STATUSES[known] : 'neutral',
    known,
    text: words.charAt(0).toUpperCase() + words.slice(1),
  };
}

type StatusBadgeProps = {
  /** The status exactly as the store sent it. */
  status: string;
  className?: string;
};

/** A small pill naming a status: "Processing", "Delivered", "Cancelled". */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useTranslations('catalog');
  const { tone, known, text } = describeStatus(status);
  const styles = STATUS_TONES[tone];

  return (
    <View
      className={cn(
        'min-h-7 items-center justify-center self-start rounded-full border px-3 py-1',
        styles.box,
        className
      )}>
      <Text variant="caption" className={cn('font-semibold', styles.label)} numberOfLines={1}>
        {known ? t(`status.${known}`) : text}
      </Text>
    </View>
  );
}

type DiscountPillProps = {
  /** The store's own words for the discount ("-12%", "10% OFF"). The app never works one out. */
  label: string;
  /** `sm` sits on a card's picture; `md` beside the product page's price. */
  size?: 'sm' | 'md';
  className?: string;
};

/** The discount, in a `sale` pill. */
export function DiscountPill({ label, size = 'md', className }: DiscountPillProps) {
  return (
    <View
      className={cn(
        'items-center justify-center self-start rounded-full bg-sale',
        size === 'md' ? 'min-h-6 px-3 py-1' : 'min-h-[18px] px-2 py-0.5',
        className
      )}>
      {/* `background`, not white: white on the dark theme's lighter `sale` is too faint to read. */}
      <Text
        variant={size === 'md' ? 'label' : 'badge'}
        className={cn('text-background', size === 'md' && 'text-[13px] leading-[16px] font-bold')}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
