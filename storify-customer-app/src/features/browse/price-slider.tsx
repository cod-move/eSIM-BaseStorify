import { useRef, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Text } from '@/components/ui/text';
import type { PriceRange } from '@/contracts/mobile/shop/v1';
import { useRtl } from '@/i18n/use-rtl';

/** The thumb as it is seen; its touch area reaches 44 pt through `hitSlop`. */
const THUMB = 24;
const SLOP = (44 - THUMB) / 2;

type PriceChoice = { minPrice?: number; maxPrice?: number };

type PriceSliderProps = {
  range: PriceRange;
  /** The chosen bounds; `undefined` is the range's own end, which filters nothing. */
  min?: number;
  max?: number;
  onChange: (next: PriceChoice) => void;
};

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * The price filter: two thumbs on the store's range, moving in the
 * store's step, with the chosen bounds above them. The app formats no money, so
 * a bound is the plain number with the store's currency code beside it; the
 * range's own ends are printed as the store formatted them.
 */
export function PriceSlider({ range, min, max, onChange }: PriceSliderProps) {
  const t = useTranslations('browse');
  const format = useFormatter();
  const rtl = useRtl();
  const [width, setWidth] = useState(0);
  const floor = range.min.amount;
  const ceiling = Math.max(range.max.amount, floor);
  const step = range.step > 0 ? range.step : 1;
  const low = clamp(min ?? floor, floor, ceiling);
  const high = clamp(max ?? ceiling, low, ceiling);
  const span = ceiling - floor;
  const toX = (value: number) => (span > 0 ? ((value - floor) / span) * width : 0);

  // Where a drag began: the finger, and the thumb.
  const origin = useRef({ pageX: 0, x: 0 });
  const valueAt = (x: number) =>
    clamp(
      Math.round((floor + Math.round(((x / width) * span) / step) * step) * 100) / 100,
      floor,
      ceiling
    );
  const dragOf = (which: 'low' | 'high') => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // The sheet scrolls up and down; a thumb being dragged keeps the gesture.
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      origin.current = { pageX: event.nativeEvent.pageX, x: toX(which === 'low' ? low : high) };
    },
    onResponderMove: (event: GestureResponderEvent) => {
      if (width <= 0 || span <= 0) return;
      const dx = event.nativeEvent.pageX - origin.current.pageX;
      const value = valueAt(clamp(origin.current.x + (rtl ? -dx : dx), 0, width));
      const next =
        which === 'low'
          ? { low: Math.min(value, high), high }
          : { low, high: Math.max(value, low) };
      if (next.low !== low || next.high !== high)
        onChange(choiceOf(next.low, next.high, floor, ceiling));
    },
  });

  const number = (value: number) =>
    format.number(value, { maximumFractionDigits: Number.isInteger(step) ? 0 : 2 });
  const nudge = (which: 'low' | 'high', direction: 1 | -1) => {
    const moved = (which === 'low' ? low : high) + direction * step;
    const next =
      which === 'low'
        ? { low: clamp(moved, floor, high), high }
        : { low, high: clamp(moved, low, ceiling) };
    onChange(choiceOf(next.low, next.high, floor, ceiling));
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Bound label={t('priceFrom')} currency={range.min.currency} value={number(low)} />
        <View className="h-px w-3 bg-border" />
        <Bound label={t('priceTo')} currency={range.max.currency} value={number(high)} />
      </View>

      <View
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        className="h-11 justify-center"
        style={{ marginHorizontal: THUMB / 2 }}>
        <View className="h-1 rounded-full bg-border" />
        <View
          className="absolute h-1 rounded-full bg-foreground"
          style={{ start: toX(low), width: Math.max(toX(high) - toX(low), 0) }}
        />
        {(['low', 'high'] as const).map((which) => {
          const value = which === 'low' ? low : high;
          return (
            <View
              key={which}
              {...dragOf(which)}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={which === 'low' ? t('priceFrom') : t('priceTo')}
              accessibilityValue={{ min: floor, max: ceiling, now: value, text: number(value) }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) =>
                nudge(which, event.nativeEvent.actionName === 'increment' ? 1 : -1)
              }
              hitSlop={SLOP}
              className="absolute rounded-full border-[3px] border-background bg-foreground shadow-card"
              style={{ width: THUMB, height: THUMB, start: toX(value) - THUMB / 2 }}
            />
          );
        })}
      </View>

      <Text variant="caption">
        {t('priceRange', { min: range.min.formatted, max: range.max.formatted })}
      </Text>
    </View>
  );
}

/** A bound is no filter at the range's own end. */
function choiceOf(low: number, high: number, floor: number, ceiling: number): PriceChoice {
  return {
    minPrice: low > floor ? low : undefined,
    maxPrice: high < ceiling ? high : undefined,
  };
}

function Bound({ label, currency, value }: { label: string; currency: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value} ${currency}`}
      className="min-h-12 flex-1 flex-row items-center gap-2 rounded-xl border border-border px-3">
      <Text variant="caption">{currency}</Text>
      <Text variant="label" className="flex-1 text-center" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
