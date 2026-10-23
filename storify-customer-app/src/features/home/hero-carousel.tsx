import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useReduceMotion } from '@/components/ui/motion';
import type { Slide as SlideData } from '@/contracts/mobile/shop/v1';

import { Slide } from './slide';

/** The gap between slides, and how much of each neighbour shows at the sides. */
const GAP = 12;
const PEEK = 24;
/** How long the row must be still before a jump back to the middle copy, so it never jumps mid-swipe. */
const SETTLE_MS = 120;

// The browser does not know `snapToInterval`: there the row snaps with CSS
// scroll snapping, each slide to the centre.
const WEB_SNAP_ROW = (Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : {}) as ViewStyle;
const WEB_SNAP_SLIDE = (Platform.OS === 'web' ? { scrollSnapAlign: 'center' } : {}) as ViewStyle;
/** A slide off the middle shrinks and dims, so the one in view stands forward. */
const SIDE_SCALE = 0.92;
const SIDE_OPACITY = 0.7;
/** The page dots, quiet: a dot, the gap between dots, and the pill the dot in view widens into. */
const DOT = 6;
const DOT_GAP = 6;
const PILL = 18;

type HeroCarouselProps = {
  slides: SlideData[];
  /** Width divided by height of every slide: the shape the store designed the hero for. */
  aspectRatio: number;
  /** The store's autoplay, in seconds; none when it sets none. */
  autoplaySeconds?: number;
};

/**
 * The store's hero as one endless carousel: each slide snaps to the middle with
 * a slice of the one before at the start and the one after at the end, the
 * last slide before the first. It swipes either way for ever and moves on by
 * itself at the store's pace, never while the shopper touches it and only once
 * it has rested a whole interval after they let go.
 *
 * It runs on three copies of the slides and starts on the middle one; once a
 * swipe or a step has settled in an outer copy, it jumps without animation to
 * the same slide in the middle copy, which looks the same.
 */
export function HeroCarousel({ slides, aspectRatio, autoplaySeconds }: HeroCarouselProps) {
  const window = useWindowDimensions();
  const scroll = useRef<Animated.ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reduceMotion = useReduceMotion();
  // A finger on the row: no step until it lets go.
  const touching = useRef(false);
  // Bumped on every release, so the wait for the next step starts again from it.
  const [released, setReleased] = useState(0);
  const count = slides.length;
  const looping = count > 1;
  const inset = PEEK + GAP;
  const width = window.width - inset * 2;
  const height = width / aspectRatio;
  const step = width + GAP;
  // The slide in view, counted across the three copies.
  const [index, setIndex] = useState(looping ? count : 0);
  const at = useRef(index);
  // The row's offset, written on the UI thread by every scroll event. It drives each slide's scale
  // and the dots' pill continuously, so nothing waits for the row to land.
  const scrollX = useSharedValue(index * step);
  // The same offset, but a whole slide at a time when the shopper asks for less motion.
  const position = useDerivedValue(() =>
    reduceMotion ? Math.round(scrollX.value / step) * step : scrollX.value
  );

  // Start on the middle copy, and stay on the same slide when the width changes.
  useEffect(() => {
    if (looping) scroll.current?.scrollTo({ x: at.current * step, animated: false });
  }, [looping, step]);

  // The store's autoplay: one step once the row has rested for the store's interval. Any
  // touch, swipe or step starts the wait again (`index` and `released`), so the row never moves
  // under a finger or right after one.
  const delay = looping && autoplaySeconds && autoplaySeconds > 0 ? autoplaySeconds * 1000 : 0;
  useEffect(() => {
    if (!delay) return;
    const timer = setTimeout(() => {
      if (touching.current) return;
      at.current += 1;
      setIndex(at.current);
      scroll.current?.scrollTo({ x: at.current * step, animated: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, step, index, released]);

  useEffect(() => () => clearTimeout(settle.current), []);

  // The row's offset on the JS thread, for the slide in view and the jump back to the middle copy.
  const onOffset = useCallback(
    (x: number) => {
      const next = Math.round(x / step);
      at.current = next;
      setIndex(next);
      clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        // A row that came to rest between two slides (a swipe the platform did
        // not snap, a trackpad, a mouse wheel) glides to the nearer one.
        if (!touching.current && Math.abs(x - next * step) > 1) {
          scroll.current?.scrollTo({ x: next * step, animated: true });
          return;
        }
        if (!looping) return;
        // Back to the middle copy, on the same slide.
        if (at.current < count || at.current >= count * 2) {
          const to = (((at.current % count) + count) % count) + count;
          at.current = to;
          setIndex(to);
          scroll.current?.scrollTo({ x: to * step, animated: false });
        }
      }, SETTLE_MS);
    },
    [count, looping, step]
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
    scheduleOnRN(onOffset, event.contentOffset.x);
  });

  const hold = () => {
    touching.current = true;
  };
  const letGo = () => {
    touching.current = false;
    setReleased((times) => times + 1);
  };

  const shown = looping
    ? [0, 1, 2].flatMap((copy) => slides.map((slide) => ({ copy, slide })))
    : slides.map((slide) => ({ copy: 0, slide }));

  return (
    <View className="gap-2.5">
      <Animated.ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        onTouchStart={hold}
        onScrollBeginDrag={hold}
        onTouchEnd={letGo}
        onTouchCancel={letGo}
        onScrollEndDrag={letGo}
        style={WEB_SNAP_ROW}
        contentContainerStyle={{ paddingHorizontal: inset, gap: GAP }}>
        {shown.map(({ copy, slide }, place) => (
          <SlideFrame
            key={`${copy}-${slide.id}`}
            slide={slide}
            place={place}
            position={position}
            step={step}
            width={width}
            height={height}
            reduceMotion={reduceMotion}
            // Only the middle copy is read out; the others are the loop's seams.
            hidden={looping && copy !== 1}
          />
        ))}
      </Animated.ScrollView>
      {looping ? <Dots count={count} position={position} step={step} /> : null}
    </View>
  );
}

type SlideFrameProps = {
  slide: SlideData;
  /** Its place in the row, across the three copies. */
  place: number;
  position: SharedValue<number>;
  step: number;
  width: number;
  height: number;
  reduceMotion: boolean;
  hidden: boolean;
};

/**
 * A slide at the row's offset: full in the middle, smaller and dimmer to the sides, moving
 * continuously with the finger. A shrunken neighbour also moves in by what it lost, so its near
 * edge stays one gap from the slide in view and it peeks as far as the layout says. With reduced
 * motion it keeps its size and only dims.
 */
function SlideFrame({
  slide,
  place,
  position,
  step,
  width,
  height,
  reduceMotion,
  hidden,
}: SlideFrameProps) {
  const inward = ((1 - SIDE_SCALE) * width) / 2;
  const animated = useAnimatedStyle(() => {
    const range = [(place - 1) * step, place * step, (place + 1) * step];
    const x = position.value;
    return {
      opacity: interpolate(x, range, [SIDE_OPACITY, 1, SIDE_OPACITY], Extrapolation.CLAMP),
      transform: reduceMotion
        ? []
        : [
            { translateX: interpolate(x, range, [-inward, 0, inward], Extrapolation.CLAMP) },
            { scale: interpolate(x, range, [SIDE_SCALE, 1, SIDE_SCALE], Extrapolation.CLAMP) },
          ],
    };
  });

  return (
    <Animated.View
      style={[{ width, height }, WEB_SNAP_SLIDE, animated]}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}>
      <Slide slide={slide} className="flex-1" />
    </Animated.View>
  );
}

/**
 * The page dots. The dot in view widens into a pill as the row reaches it and narrows as it
 * leaves, so the others make way for it and never overlap it, in either direction of reading.
 * Screen readers count the slides themselves.
 */
function Dots({
  count,
  position,
  step,
}: {
  count: number;
  position: SharedValue<number>;
  step: number;
}) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="flex-row items-center self-center"
      style={{ gap: DOT_GAP }}>
      {Array.from({ length: count }, (_, dot) => (
        <Dot key={dot} dot={dot} count={count} position={position} step={step} />
      ))}
    </View>
  );
}

function Dot({
  dot,
  count,
  position,
  step,
}: {
  dot: number;
  count: number;
  position: SharedValue<number>;
  step: number;
}) {
  // 1 while the row rests on this dot's slide, falling to 0 a whole slide away; the slides repeat
  // in three copies, so it measures from the nearest copy.
  const strength = useDerivedValue(() => {
    const x = position.value / step;
    const offset = (((Math.round(x) - dot) % count) + count) % count;
    const home = Math.round(x) - offset;
    const away = Math.min(Math.abs(x - home), Math.abs(x - (home + count)));
    return interpolate(away, [0, 1], [1, 0], Extrapolation.CLAMP);
  });
  const widen = useAnimatedStyle(() => ({ width: DOT + (PILL - DOT) * strength.value }));
  const fill = useAnimatedStyle(() => ({ opacity: strength.value }));

  return (
    <Animated.View
      className="overflow-hidden rounded-full bg-border"
      style={[{ height: DOT }, widen]}>
      <Animated.View className="absolute inset-0 rounded-full bg-foreground" style={fill} />
    </Animated.View>
  );
}
