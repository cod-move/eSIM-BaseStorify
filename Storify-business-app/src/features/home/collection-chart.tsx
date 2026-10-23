import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useFormatter, useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { HomeCollectionTrend } from '@/contracts/mobile/biz/v1';
import { cn } from '@/lib/cn';

/** The height of a day's track, unless a screen says: the bar of the day with the most collected fills it. */
const CHART_HEIGHT = 96;
/** A day with anything collected shows at least this much, so it never reads as nothing. */
const MIN_BAR = 6;
/** The bars rise one after another, this far apart, when the graph first shows. */
const STAGGER_MS = 40;
const GROW = { duration: 520, easing: Easing.out(Easing.cubic) } as const;
/** Past this many days, only some days are named under the bars. */
const NAMED_DAYS = 7;
/** The longest short weekday name that fits under a bar on the narrowest phone. */
const SHORT_WEEKDAY = 4;
/**
 * A day's column: its touch area and its name's room. The columns touch; the
 * space between two tracks is their columns' own padding.
 */
const COLUMN = 'min-w-0 flex-1 items-center px-1';
/** A day's track: the full height, a slim pill centred in its column. */
const TRACK = 'h-full w-full max-w-[30px] justify-end overflow-hidden rounded-full';

/** A UTC day (`YYYY-MM-DD`) at its noon, so every time zone names the same date. */
export function noonOf(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

type CollectionChartProps = {
  trend: HomeCollectionTrend;
  /** The UTC day the store calls today (GET /home `day`). */
  today: string;
  /** The tracks' height, in points. */
  height?: number;
  /** Shown in every amount's place while the operator hides Home's amounts. */
  mask?: string;
};

/**
 * The collection graph on Home's summary card: one bar
 * per UTC day, oldest first (right to left in a right-to-left language),
 * drawn on the card's `primary` in its own foreground, so it reads on any
 * store's colour. Each bar's height is the store's own fraction, mapped to
 * points; the app adds up no money. Today's bar is solid; tapping a day shows
 * its amount in the line above, and tapping it again goes back.
 */
export function CollectionChart({
  trend,
  today,
  height = CHART_HEIGHT,
  mask,
}: CollectionChartProps) {
  const t = useTranslations('home');
  const format = useFormatter();
  const [chosen, setChosen] = useState<string | null>(null);
  const { points } = trend;
  const picked = points.findIndex((point) => point.day === chosen);
  const solid = picked >= 0 ? picked : points.length - 1;
  const quiet = points.every((point) => point.fraction === 0);
  const dense = points.length > NAMED_DAYS;
  const every = Math.ceil(points.length / NAMED_DAYS);
  const weekdays = points.map((point) =>
    format.dateTime(noonOf(point.day), { weekday: 'short', timeZone: 'UTC' })
  );
  // A language whose short weekdays run long (Arabic's are its full names)
  // names the days by their date instead, which always fits under a bar.
  const byWeekday = weekdays.every((name) => name.length <= SHORT_WEEKDAY);
  const pickedPoint = picked >= 0 ? points[picked] : undefined;
  const readout = pickedPoint
    ? t('trendReadout', {
        date: format.dateTime(noonOf(pickedPoint.day), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }),
        value: mask ?? pickedPoint.money.formatted,
      })
    : t('trendTitle');

  return (
    <View className="gap-3">
      <View className="min-h-4 flex-row items-center justify-between gap-3">
        <Text
          variant="caption"
          numberOfLines={1}
          accessibilityLiveRegion="polite"
          className={cn(
            'shrink font-semibold',
            pickedPoint ? 'text-primary-foreground' : 'text-primary-foreground/75'
          )}>
          {readout}
        </Text>
        <Text variant="caption" numberOfLines={1} className="shrink text-primary-foreground/60">
          {quiet ? t('trendEmpty') : t('trendMaximum', { value: mask ?? trend.maximum.formatted })}
        </Text>
      </View>
      <View className="flex-row" style={{ height }}>
        {points.map((point, index) => (
          <DayBar
            key={point.day}
            fraction={point.fraction}
            height={height}
            order={index}
            solid={index === solid}
            selected={index === picked}
            label={t('trendPoint', {
              date: format.dateTime(noonOf(point.day), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }),
              value: mask ?? point.money.formatted,
            })}
            onPress={() => setChosen((current) => (current === point.day ? null : point.day))}
          />
        ))}
      </View>
      <View
        className="flex-row"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        {points.map((point, index) => {
          const named = !dense || index === points.length - 1 || index % every === 0;
          const name =
            point.day === today
              ? t('today')
              : byWeekday
                ? weekdays[index]
                : format.dateTime(noonOf(point.day), { day: 'numeric', timeZone: 'UTC' });
          return (
            <Text
              key={point.day}
              variant="caption"
              numberOfLines={1}
              className={cn(
                'min-w-0 flex-1 text-center',
                index === solid
                  ? 'font-semibold text-primary-foreground'
                  : 'text-primary-foreground/75'
              )}>
              {named ? name : ''}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

type DayBarProps = {
  /** The store's height for the day, 0 to 1. */
  fraction: number;
  /** The track's height, in points. */
  height: number;
  /** Its place from the oldest day: the bars rise in turn. */
  order: number;
  /** Drawn solid: today, or the day the operator picked. */
  solid: boolean;
  selected: boolean;
  label: string;
  onPress: () => void;
};

/** One day: a quiet track the height of the graph, and the day's bar rising in it. */
function DayBar({ fraction, height, order, solid, selected, label, onPress }: DayBarProps) {
  const target = fraction > 0 ? Math.max(MIN_BAR, fraction * height) : 0;
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(order * STAGGER_MS, withTiming(target, GROW));
  }, [grow, order, target]);
  const grown = useAnimatedStyle(() => ({ height: grow.value }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(COLUMN, 'active:opacity-80')}>
      <View className={cn(TRACK, 'bg-primary-foreground/15')}>
        <Animated.View
          style={grown}
          className={cn(
            'w-full rounded-full',
            solid ? 'bg-primary-foreground' : 'bg-primary-foreground/70'
          )}
        />
      </View>
    </Pressable>
  );
}

/**
 * The graph's place when the store sends no trend (an API from before it):
 * the empty tracks, so the card keeps its shape, under a line that says why.
 * Never bars: a missing figure must not read as a quiet week.
 */
export function CollectionChartUnavailable({ height = CHART_HEIGHT }: { height?: number }) {
  const t = useTranslations('home');
  return (
    <View className="gap-3">
      <Text variant="caption" className="font-semibold text-primary-foreground/75">
        {t('trendTitle')}
      </Text>
      <View className="justify-center" style={{ height }}>
        <View className="absolute inset-0 flex-row">
          {Array.from({ length: NAMED_DAYS }, (_, index) => (
            <View key={index} className={COLUMN}>
              <View className={cn(TRACK, 'bg-primary-foreground/15')} />
            </View>
          ))}
        </View>
        <View className="max-w-full flex-row items-center gap-2 self-center rounded-full bg-primary px-4 py-2">
          <Icon name="chart" size={16} colorClassName="accent-primary-foreground" />
          <Text variant="caption" className="shrink text-primary-foreground/85">
            {t('trendUnavailable')}
          </Text>
        </View>
      </View>
    </View>
  );
}
