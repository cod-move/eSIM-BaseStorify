import type { NativeStackNavigationOptions, NativeStackNavigationProp } from 'expo-router';
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  LinearTransition,
  type CSSAnimationKeyframes,
} from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { useRtl } from '@/i18n/use-rtl';

/*
 * The app's motion: quiet and quick, nothing that bounces.
 * Content that arrives rises into place once; a pushed screen on the
 * web enters from the end edge; tabs crossfade. The phone's reduce-motion
 * setting turns all of it off: no animation here is even asked for once
 * `useReduceMotion()` knows the setting.
 *
 * The reveal and the web entrance are CSS animations (Reanimated 4), not
 * layout animations: once one ends, the view keeps no opacity, transform or
 * position of its own. (On the web, a custom `entering` keyframe is pinned
 * with `position: absolute` a few seconds after it ends, which piles the
 * content up.)
 */

const REVEAL_MS = 360;
const REVEAL_RISE = 16;
const REVEAL_SCALE = 0.97;
const STAGGER_MS = 50;
/** The items of a list that are staggered; the ones after them show at once. */
const STAGGER_ITEMS = 8;
/** In a grid, a card scrolled into view rises this long after the one at the start of its row. */
const COLUMN_STAGGER_MS = 60;
/** The columns of a grid that are staggered; a wider grid's later columns rise with the last one. */
const STAGGER_COLUMNS = 4;
/**
 * How long after a list first shows its items still reveal. Rows that mount
 * later (the next page, a row scrolled to, a recycled cell) appear at once.
 */
const REVEAL_WINDOW_MS = STAGGER_ITEMS * STAGGER_MS + REVEAL_MS;
const LEAVE_MS = 180;
const CLOSE_GAP_MS = 220;
const ENTRANCE_MS = 280;
const ENTRANCE_SHIFT = 28;

/** A fade, a 16 pt rise and a slight growth. */
const RISE: CSSAnimationKeyframes = {
  from: { opacity: 0, transform: [{ translateY: REVEAL_RISE }, { scale: REVEAL_SCALE }] },
  to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
};

/** The rise, `delay` ms from now. Before it starts the view is hidden; once it ends, it is left as it was. */
function riseAfter(delay: number) {
  return {
    animationName: RISE,
    animationDuration: REVEAL_MS,
    animationDelay: delay,
    animationTimingFunction: 'ease-out',
    animationFillMode: 'backwards',
  } as const;
}

/** Each step of a list's stagger, 50 ms after the one before. */
const REVEALS = Array.from({ length: STAGGER_ITEMS }, (_, step) => riseAfter(step * STAGGER_MS));
/** A grid card scrolled into view, by its column. */
const COLUMN_REVEALS = Array.from({ length: STAGGER_COLUMNS }, (_, column) =>
  riseAfter(column * COLUMN_STAGGER_MS)
);
const LEAVE = FadeOut.duration(LEAVE_MS);
const CLOSE_GAP = LinearTransition.duration(CLOSE_GAP_MS).easing(Easing.out(Easing.cubic));

export type RevealStep = ReturnType<typeof riseAfter>;

/** Whether the phone, or the browser, asks for less motion. Follows the setting as it changes. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduce(on);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  return reduce;
}

/** The reveal of the item at `index` of a list: none past the first eight, or with reduce motion on. */
export function revealAt(index: number, reduceMotion: boolean): RevealStep | undefined {
  if (reduceMotion || index < 0 || index >= STAGGER_ITEMS) return undefined;
  return REVEALS[index];
}

/** How the tabs change: a short crossfade, or none with reduce motion on. */
export function tabAnimation(reduceMotion: boolean): 'fade' | 'none' {
  return reduceMotion ? 'none' : 'fade';
}

/**
 * The reveal of a list, played once, when it first shows its items (`shown`,
 * for a list drawn once its data has come): from an
 * item's index to the `entering` of its `Reveal`. A refetch, a re-render, the
 * next page or a recycled cell never plays it again: past the first moment,
 * every item shows at once.
 */
export function useReveal(shown = true): (index: number) => RevealStep | undefined {
  const reduceMotion = useReduceMotion();
  const over = useFirstMomentOver(shown);

  return (index) => (over ? undefined : revealAt(index, reduceMotion));
}

/** Whether the first moment of a list (from when it first shows, as long as its stagger lasts) is over. */
function useFirstMomentOver(shown: boolean): boolean {
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setOver(true), REVEAL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return over;
}

type CardRevealContext = {
  /** The products whose card has already shown. */
  revealed: ReadonlySet<string>;
  columns: number;
  /** The grid is in its first moment: the first screen of cards keeps the list's stagger. */
  firstMoment: boolean;
  reduceMotion: boolean;
};

/** A card's reveal: its rise, and whether it waits, hidden, until the card comes into view. */
export type CardReveal = { step: RevealStep; waits: boolean };

/**
 * The reveal of the card of product `id` at `index` of a grid: each product
 * rises once, the first time its card comes into view. The first screen of
 * cards rises as it mounts, with the list's stagger; a card scrolled or paged
 * into view rises by its column, the row's first card first (the start edge,
 * so mirrored in right-to-left).
 */
export function cardRevealAt(
  id: string,
  index: number,
  { revealed, columns, firstMoment, reduceMotion }: CardRevealContext
): CardReveal | undefined {
  if (reduceMotion || revealed.has(id)) return undefined;
  const first = firstMoment ? revealAt(index, false) : undefined;
  if (first) return { step: first, waits: false };
  const step = COLUMN_REVEALS[Math.min(index % columns, STAGGER_COLUMNS - 1)];
  return step && { step, waits: true };
}

/** What a grid knows of its cards, for its whole life. */
type GridLog = {
  /** Products whose card has shown: they never rise again. */
  revealed: Set<string>;
  /** Products whose card has come into view. */
  seen: Set<string>;
  /** The grid never said what is in view: no card waits for it. */
  blind: boolean;
  listeners: Set<() => void>;
};

/** How long a grid may take to first say what is in view before its cards stop waiting for it. */
const BLIND_MS = 1500;

/** A card counts as in view once a tenth of it shows, at once. */
const IN_VIEW = { itemVisiblePercentThreshold: 10, minimumViewTime: 0 } as const;

type RevealCardProps = {
  /** The product the card shows (the list's key for it). */
  id: string;
  log: GridLog;
  reveal: CardReveal | undefined;
};

/**
 * The reveal of a grid of product cards (`columns` wide; `shown` once its data
 * has come): `list` goes on the FlashList, `card(id, index)` on each
 * `RevealCard`. A recycled cell, scrolling back, a refetch or a re-render never
 * plays a product's reveal again.
 */
export function useGridReveal(shown: boolean, columns: number) {
  const reduceMotion = useReduceMotion();
  const over = useFirstMomentOver(shown);
  const [log] = useState<GridLog>(() => ({
    revealed: new Set(),
    seen: new Set(),
    blind: false,
    listeners: new Set(),
  }));
  const [onViewableItemsChanged] = useState(
    () =>
      ({ viewableItems }: { viewableItems: readonly { key: string }[] }) => {
        for (const item of viewableItems) log.seen.add(item.key);
        for (const listener of log.listeners) listener();
      }
  );

  useEffect(() => {
    if (!shown) return;
    // A grid that never reports what is in view must not keep its cards hidden.
    const timer = setTimeout(() => {
      if (log.seen.size > 0) return;
      log.blind = true;
      for (const listener of log.listeners) listener();
    }, BLIND_MS);
    return () => clearTimeout(timer);
  }, [shown, log]);

  return {
    list: { onViewableItemsChanged, viewabilityConfig: IN_VIEW },
    card: (id: string, index: number): RevealCardProps => ({
      id,
      log,
      reveal: cardRevealAt(id, index, {
        revealed: log.revealed,
        columns,
        firstMoment: !over,
        reduceMotion,
      }),
    }),
  };
}

const RevealView = withUniwind(Animated.View);

type RevealProps = {
  /** The item's reveal, from `useReveal()`; without one it shows at once. */
  entering?: RevealStep;
  /** The item can leave its list: it fades out and the items after it close the gap. */
  leaves?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * A view that rises into place when it first shows. Never put one around a
 * sheet or a blur: a fading ancestor leaves a blur nothing to blur.
 */
export function Reveal({ entering, leaves = false, className = '', style, children }: RevealProps) {
  const reduceMotion = useReduceMotion();
  const moves = leaves && !reduceMotion;

  return (
    <RevealView
      exiting={moves ? LEAVE : undefined}
      layout={moves ? CLOSE_GAP : undefined}
      className={className}
      style={[style, reduceMotion ? undefined : entering]}>
      {children}
    </RevealView>
  );
}

/**
 * A product card of a grid, from `useGridReveal()`, that rises into place the
 * first time its product comes into view. A recycled cell given another
 * product is a new card: it rises if that product has not shown yet.
 */
export function RevealCard({
  className,
  children,
  ...card
}: RevealCardProps & { className?: string; children: ReactNode }) {
  return (
    <CardRise key={card.id} {...card} className={className}>
      {children}
    </CardRise>
  );
}

const WAITING = { opacity: 0 } as const;

function CardRise({
  id,
  log,
  reveal: offered,
  className,
  children,
}: RevealCardProps & { className?: string; children: ReactNode }) {
  // Chosen once, as the card mounts: a later render (a refetch) never plays it again.
  const [reveal] = useState(offered);
  const inView = useSyncExternalStore(
    (onChange) => {
      log.listeners.add(onChange);
      return () => log.listeners.delete(onChange);
    },
    () => log.blind || log.seen.has(id)
  );
  const shows = !reveal?.waits || inView;

  useEffect(() => {
    if (shows) log.revealed.add(id);
  }, [shows, log, id]);

  return (
    <Reveal
      entering={shows ? reveal?.step : undefined}
      style={shows ? undefined : WAITING}
      className={className}>
      {children}
    </Reveal>
  );
}

/** The stacks' transition on the phones: the platform's own push (iOS slides, Android its default). */
export const STACK_ANIMATION = {
  animation: 'default',
} as const satisfies NativeStackNavigationOptions;

type ScreenLayoutArgs = {
  route: { key: string };
  options: NativeStackNavigationOptions;
  navigation: Pick<
    NativeStackNavigationProp<Record<string, object | undefined>>,
    'addListener' | 'getState'
  >;
  children: ReactElement;
};

/**
 * The stacks' screen layout. On the web the native stack changes screens with
 * no motion of its own, so a pushed screen enters here: a 28 pt slide from the
 * end edge while a cover of the page's colour fades off it; the screen a
 * shopper goes back to slides from the start edge. The screen itself never
 * fades, so a blur in it (the search panel's) keeps blurring. A screen shown
 * again because its tab was chosen does not move (the tabs crossfade), and
 * sheets keep their own motion. The phones keep the native one.
 */
export function screenEntrance({
  route,
  options,
  navigation,
  children,
}: ScreenLayoutArgs): ReactElement {
  const sheet = options.presentation !== undefined && options.presentation !== 'card';
  if (Platform.OS !== 'web' || sheet) return children;

  return (
    <ScreenEntrance routeKey={route.key} navigation={navigation}>
      {children}
    </ScreenEntrance>
  );
}

type Entry = 'push' | 'back';

/** The keyframes of an entrance's slide, by where it comes from: +1 the right, -1 the left. */
function entranceFrom(side: 1 | -1): CSSAnimationKeyframes {
  return {
    from: { transform: [{ translateX: side * ENTRANCE_SHIFT }] },
    to: { transform: [{ translateX: 0 }] },
  };
}

const ENTRANCES = {
  ltr: { push: entranceFrom(1), back: entranceFrom(-1) },
  rtl: { push: entranceFrom(-1), back: entranceFrom(1) },
} as const;

const UNCOVER: CSSAnimationKeyframes = { from: { opacity: 1 }, to: { opacity: 0 } };

function ScreenEntrance({
  routeKey,
  navigation,
  children,
}: {
  routeKey: string;
  navigation: ScreenLayoutArgs['navigation'];
  children: ReactElement;
}) {
  const rtl = useRtl();
  const reduceMotion = useReduceMotion();
  // A screen pushed onto its stack enters; the stack's first screen is already there.
  const [entry, setEntry] = useState<Entry | null>(() => {
    const { routes } = navigation.getState();
    return routes.findIndex((route) => route.key === routeKey) > 0 ? 'push' : null;
  });

  useEffect(() => {
    // Covered by a screen pushed over it: it comes back when that one goes.
    let covered = false;
    const offBlur = navigation.addListener('blur', () => {
      const { routes, index } = navigation.getState();
      covered = routes[index]?.key !== routeKey;
      // Ready to play again: the screen is hidden while covered.
      if (covered) setEntry(null);
    });
    const offFocus = navigation.addListener('focus', () => {
      if (covered) setEntry('back');
      covered = false;
    });
    return () => {
      offBlur();
      offFocus();
    };
  }, [navigation, routeKey]);

  const enters = entry !== null && !reduceMotion;

  // CSS animations: once they end, the screen keeps no transform of its own and the cover is gone.
  return (
    <Animated.View
      style={{
        flex: 1,
        animationName: enters ? ENTRANCES[rtl ? 'rtl' : 'ltr'][entry] : 'none',
        animationDuration: ENTRANCE_MS,
        animationTimingFunction: 'ease-out',
      }}>
      {children}
      {enters ? <Cover /> : null}
    </Animated.View>
  );
}

/** The page's colour over an entering screen, fading off it; gone once the entrance ends. */
function Cover() {
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShown(false), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!shown) return null;
  return (
    <RevealView
      className="bg-background"
      style={[
        StyleSheet.absoluteFill,
        {
          pointerEvents: 'none',
          animationName: UNCOVER,
          animationDuration: ENTRANCE_MS,
          animationTimingFunction: 'ease-out',
          animationFillMode: 'forwards',
        },
      ]}
    />
  );
}
