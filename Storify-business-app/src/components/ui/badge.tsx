import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useFormatter, useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { pop } from './press-motion';
import { Text } from './text';

/** The most a count badge spells out; more shows as "99+". */
const COUNT_BADGE_MAX = 99;

/** What a count badge shows: nothing at zero, the count up to `max`, then `max` with a plus. */
export function badgeCount(
  count: number,
  max = COUNT_BADGE_MAX
): { value: number; more: boolean } | null {
  if (!(count > 0)) return null;
  return count > max ? { value: max, more: true } : { value: count, more: false };
}

/** How far a badge swells when its number changes. */
const BOUNCE_PEAK = 1.3;
/** A badge appearing from nothing overshoots a little, then settles. */
const POP_IN = { stiffness: 420, damping: 14, mass: 1 } as const;

/** The badge bounces when its count changes, and pops in when the count leaves zero. */
function useCountMotion(count: number) {
  const scale = useSharedValue(count > 0 ? 1 : 0);
  const before = useRef(count);

  useEffect(() => {
    const previous = before.current;
    before.current = count;
    if (!(count > 0)) {
      scale.value = 0;
      return;
    }
    if (count === previous) return;
    scale.value = previous > 0 ? pop(BOUNCE_PEAK) : withSpring(1, POP_IN);
  }, [count, scale]);

  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

type CountBadgeProps = {
  count: number;
  max?: number;
  className?: string;
};

/**
 * A small round count in `link` (the house's badge colour): unread
 * conversations on the Inbox tab, a filter's count. It draws nothing at zero,
 * and says nothing to a screen reader: the control it sits on names the count.
 * Place it with `className` (`absolute -end-1 -top-1`).
 */
export function CountBadge({ count, max = COUNT_BADGE_MAX, className }: CountBadgeProps) {
  const t = useTranslations('common');
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
        'h-[18px] min-w-[18px] items-center justify-center rounded-full bg-link px-1',
        className
      )}
      style={motion}>
      <Text variant="badge" className="text-center text-background">
        {shown.more ? t('countMore', { count: value }) : value}
      </Text>
    </Animated.View>
  );
}

/** A dot in `link` that says "something new here" without a number: the Account tab, when notifications are unread. */
export function DotBadge({ visible, className }: { visible: boolean; className?: string }) {
  if (!visible) return null;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn('size-2.5 rounded-full border-2 border-surface bg-link', className)}
    />
  );
}
