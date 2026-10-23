import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useCSSVariable, withUniwind } from 'uniwind';

import { useRtl } from '@/i18n/use-rtl';
import { cn } from '@/lib/cn';
import { transparentOf } from '@/theme/color';

const AnimatedBlock = withUniwind(Animated.View);

/**
 * The grey shapes a screen shows where its content will be while the content
 * loads. They are drawn the size the content will be (a screen passes the
 * shape in `className`: `h-4 w-24`, `size-12 rounded-full`, `aspect-square w-full`),
 * so the page does not jump when the data arrives.
 *
 * A band of light sweeps across them from the start edge, on one clock for the
 * whole screen, so they shimmer together. A phone that asks for reduced motion
 * gets them still.
 */

const SWEEP_MS = 1300;
/** The light band's width, as a share of the shape it crosses. */
const BAND = 0.6;

const sweep = new Animated.Value(0);
let mounted = 0;
let running: Animated.CompositeAnimation | null = null;

function startSweep() {
  void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
    if (reduced || running || mounted === 0) return;
    sweep.setValue(0);
    running = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    running.start();
  });
}

/** Keeps the shared clock running for as long as a skeleton is on screen. */
function useSweep() {
  useEffect(() => {
    mounted += 1;
    if (!running) startSweep();
    return () => {
      mounted -= 1;
      if (mounted > 0) return;
      running?.stop();
      running = null;
      sweep.setValue(0);
    };
  }, []);

  return sweep;
}

type SkeletonProps = {
  /** The size and shape: `h-4 w-24`, `size-12 rounded-full`. Rounded `md` unless it says otherwise. */
  className?: string;
};

/**
 * One grey shape. It says nothing to a screen reader: the screen that shows
 * skeletons names the state it is in.
 */
export function Skeleton({ className }: SkeletonProps) {
  const progress = useSweep();
  const rtl = useRtl();
  const [width, setWidth] = useState(0);
  const light = String(useCSSVariable('--color-surface') ?? '');
  const band = width * BAND;
  // From just before the start edge to just past the end edge (the band stands at the start edge).
  const travel = rtl ? [band, -width] : [-band, width];

  return (
    <AnimatedBlock
      className={cn('overflow-hidden rounded-md bg-surface-alt', className)}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      testID="skeleton"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {width > 0 ? (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            start: 0,
            width: band,
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: travel }) },
            ],
          }}>
          <LinearGradient
            colors={[transparentOf(light), light, transparentOf(light)]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </AnimatedBlock>
  );
}

type SkeletonRowsProps = {
  /** How many rows a list is waiting for. */
  rows?: number;
  /** A thumbnail at the start of each row, as the list's rows have. */
  leading?: boolean;
  className?: string;
};

/** A list on its way: rows in the shape of `ListRow`, in a group. */
export function SkeletonRows({ rows = 6, leading = false, className }: SkeletonRowsProps) {
  return (
    <View className={cn('overflow-hidden rounded-xl bg-surface', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="min-h-[72px] flex-row items-center gap-3 px-4 py-3">
          {leading ? <Skeleton className="size-11" /> : null}
          <View className="flex-1 gap-2">
            <View className="flex-row justify-between gap-6">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-4 w-16" />
            </View>
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Home's figures on their way: tiles in pairs, in the shape of `Tile`. */
export function SkeletonTiles({ tiles = 4, className }: { tiles?: number; className?: string }) {
  const pairs = Array.from({ length: Math.ceil(tiles / 2) }, (_, index) => index);
  return (
    <View className={cn('gap-3', className)}>
      {pairs.map((pair) => (
        <View key={pair} className="flex-row gap-3">
          {[0, 1].map((side) => (
            <View key={side} className="flex-1 gap-2.5 rounded-[22px] bg-surface p-4">
              <View className="flex-row items-center justify-between">
                <Skeleton className="h-7 w-2/5" />
                <Skeleton className="size-10 rounded-[14px]" />
              </View>
              <Skeleton className="h-3 w-3/5" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
