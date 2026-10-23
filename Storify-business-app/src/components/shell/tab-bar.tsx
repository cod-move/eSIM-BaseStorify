import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { BottomTabBarHeightContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable, useUniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { CountBadge, DotBadge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useToastLift } from '@/components/ui/toast';
import { transparentOf } from '@/theme/color';

/**
 * The floating tab bar, the shopper app's: a
 * translucent pill over a blur, with a fade under it, inset from the screen's
 * edges. The active tab is a `primary` pill holding its icon and its label
 * beside it; the others show their icon only, and their label is still read by
 * screen readers. On a change of tab the pill springs to the new one, growing
 * and shrinking with the tabs on its way.
 */

const BAR_HEIGHT = 60;
/** Below the bar on a phone with no home indicator. */
const MIN_BOTTOM_GAP = 16;
/** The bar floats this much higher than the home indicator, clear of the gesture area. */
const LIFT = 10;
/** The fade above the bar, from transparent to the page's colour. */
const FADE_HEIGHT = 24;
/** How far down the bar the fade has reached the page's colour, as a share of the bar's height. */
const FADE_INTO_BAR = 0.5;
const BAR_MARGIN = 16;
/** Between the bar's edge and the active pill: (60 − 46 pt pill) / 2. */
const ROW_PADDING = 7;
const PILL_HEIGHT = 46;
/** The narrowest a tab may be: the smallest area a finger can be asked to hit. */
const MIN_TAB_WIDTH = 44;
const ICON_SIZE = 24;
/** The tabs' line icons are drawn a little finer than the app's others. */
const ICON_STROKE = 1.75;
const LABEL_GAP = 8;
/** How far the count badge reaches past the icon's end edge (its `-end-2.5`): the label starts beyond it. */
const BADGE_REACH = 10;
/** Added to a label's measured width: the web rounds a layout's width to the nearest pixel. */
const MEASURE_SLACK = 1;
/** Inside the active pill, before the icon and after the label. */
const PILL_PADDING = 16;
/** Its labels stop growing past this text size, so the bar keeps its height. */
const LABEL_MAX_SCALE = 1.3;
/** About 350 ms to settle, without overshoot; with reduced motion the pill jumps. */
const SPRING = { stiffness: 260, damping: 30, mass: 1, reduceMotion: ReduceMotion.System } as const;
/** The room a label's text is given beyond its measured width: the tab clips it, never an ellipsis. */
const LABEL_ROOM = 120;
/** How far into the slide (0 to 1) a tab's label starts to fade in. */
const LABEL_FADE_FROM = 0.5;
/** The chosen tab's icon lifts a little and grows a touch, then settles back without bouncing. */
const HOP_LIFT = 2;
const HOP_GROW = 0.06;
const HOP_UP = { duration: 130, easing: Easing.out(Easing.quad) } as const;
const HOP_DOWN = { stiffness: 300, damping: 28, mass: 1 } as const;

/** The bar's bottom edge, above the phone's home indicator. */
function barBottom(bottomInset: number): number {
  return Math.max(bottomInset, MIN_BOTTOM_GAP) + LIFT;
}

/** Everything the bar draws over at the bottom of the screen: the gap under it, the bar, and the fade above it. */
function tabBarSpace(bottomInset: number): number {
  return barBottom(bottomInset) + BAR_HEIGHT + FADE_HEIGHT;
}

/**
 * The space a tab's screen leaves at the bottom of what it scrolls, so that
 * its last row can scroll clear of the bar. Zero on a screen above the tabs.
 */
export function useTabBarHeight(): number {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const { bottom } = useSafeAreaInsets();
  return inTabs ? tabBarSpace(bottom) : 0;
}

export type TabItem = {
  /** The route of the tab in the navigator: `index`, `orders` … */
  route: string;
  icon: IconName;
  label: string;
  /** A count on the icon (unread conversations). */
  count?: number;
  /** A dot on the icon, for something new without a number (unread notifications). */
  dot?: boolean;
};

/**
 * Where the tabs stand at one moment of the slide. `position` is a tab number
 * that moves through the fractions in between (1.5: halfway from the second
 * tab to the third); every size follows from it. These run on the UI thread.
 */
type Row = {
  /** The room the tabs share, inside the bar's padding. */
  inner: number;
  /** How wide each tab is while it is the active one: its icon and label. */
  activeWidths: number[];
};

/** The room between the icon and the label: past the count badge, on a tab that shows one. */
function labelGap(count: number): number {
  return count > 0 ? BADGE_REACH + LABEL_GAP : LABEL_GAP;
}

/** `position` held to the tabs there are, so that a spring's overshoot past either end moves nothing. */
function withinTabs(position: number, row: Row): number {
  'worklet';
  return Math.min(Math.max(position, 0), row.activeWidths.length - 1);
}

/** Where tab `index` starts, from the start of the row, while it is the active one. */
function restStartOf(index: number, row: Row): number {
  'worklet';
  const others = Math.max(row.activeWidths.length - 1, 1);
  return (index * (row.inner - (row.activeWidths[index] ?? 0))) / others;
}

/** 1 on tab `index`, falling to 0 one tab away. */
function focusOf(position: number, index: number): number {
  'worklet';
  return Math.max(0, 1 - Math.abs(position - index));
}

/** The active tab's width at `position`: between the two tabs it is moving between. */
function activeWidthAt(position: number, row: Row): number {
  'worklet';
  const clamped = withinTabs(position, row);
  const from = Math.floor(clamped);
  const to = Math.min(from + 1, row.activeWidths.length - 1);
  const start = row.activeWidths[from] ?? 0;
  return start + ((row.activeWidths[to] ?? 0) - start) * (clamped - from);
}

/** Every tab's width: the inactive ones share what the active one leaves. */
function widthsAt(position: number, row: Row): number[] {
  'worklet';
  const clamped = withinTabs(position, row);
  const active = activeWidthAt(clamped, row);
  const inactive = (row.inner - active) / Math.max(row.activeWidths.length - 1, 1);
  return row.activeWidths.map(
    (_, index) => inactive + (active - inactive) * focusOf(clamped, index)
  );
}

/**
 * The pill's start edge, from the start of the row: between where the two
 * tabs it is moving between start when they are the active one, so it only
 * ever moves toward the tab it reaches.
 */
function pillStartAt(position: number, row: Row): number {
  'worklet';
  const clamped = withinTabs(position, row);
  const from = Math.floor(clamped);
  const to = Math.min(from + 1, row.activeWidths.length - 1);
  const start = restStartOf(from, row);
  return start + (restStartOf(to, row) - start) * (clamped - from);
}

type TabBarProps = BottomTabBarProps & {
  /** The tabs, in order. A tab whose route the navigator does not have (its capability is missing) is left out. */
  items: TabItem[];
};

/** The bar of the tab navigator: the tabs whose screens exist, and a press that goes to that screen. */
export function TabBar({ state, navigation, insets, items }: TabBarProps) {
  // Whether the tabs are the screen in front: a screen above them covers the bar.
  const inFront = useIsFocused();
  const entries = items.flatMap((item) => {
    const route = state.routes.find((candidate) => candidate.name === item.route);
    return route ? [{ ...item, key: route.key, name: route.name, params: route.params }] : [];
  });
  const focusedKey = state.routes[state.index]?.key;

  return (
    <TabBarView
      items={entries}
      active={entries.findIndex((entry) => entry.key === focusedKey)}
      bottomInset={insets.bottom}
      inFront={inFront}
      onSelect={(index) => {
        const entry = entries[index];
        if (!entry) return;
        const event = navigation.emit({
          type: 'tabPress',
          target: entry.key,
          canPreventDefault: true,
        });
        if (entry.key !== focusedKey && !event.defaultPrevented) {
          navigation.navigate(entry.name, entry.params);
        }
      }}
      onLongPress={(index) => {
        const entry = entries[index];
        if (entry) navigation.emit({ type: 'tabLongPress', target: entry.key });
      }}
    />
  );
}

type TabBarViewProps = {
  items: TabItem[];
  /** The index of the tab that is open; -1 when none of them is. */
  active: number;
  bottomInset: number;
  /** The bar is on screen, not covered by a screen above the tabs: toasts float above it. */
  inFront?: boolean;
  onSelect: (index: number) => void;
  onLongPress?: (index: number) => void;
};

/** The bar itself, knowing nothing of navigators. */
export function TabBarView({
  items,
  active,
  bottomInset,
  inFront = true,
  onSelect,
  onLongPress,
}: TabBarViewProps) {
  const t = useTranslations('shell');
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const current = Math.max(active, 0);

  // The toast floats above the bar.
  useToastLift('tab-bar', inFront ? barBottom(bottomInset) + BAR_HEIGHT : null);

  // The active tab is as wide as its icon and label, but leaves every other tab a finger's width.
  // Before the bar has laid out its width is the window's less its margins, never zero; until every
  // label is measured the tabs are equal, so the icons are in place from the first frame.
  const rowWidth = measured > 0 ? measured : windowWidth - 2 * BAR_MARGIN;
  const inner = Math.max(rowWidth - 2 * ROW_PADDING, 0);
  const labelsMeasured = items.every((item) => labelWidths[item.label] !== undefined);
  const row: Row = {
    inner,
    activeWidths: items.map((item) =>
      labelsMeasured
        ? Math.min(
            ICON_SIZE +
              labelGap(item.count ?? 0) +
              (labelWidths[item.label] ?? 0) +
              2 * PILL_PADDING,
            inner - (items.length - 1) * MIN_TAB_WIDTH
          )
        : inner / Math.max(items.length, 1)
    ),
  };

  const position = useSharedValue(current);
  useEffect(() => {
    position.value = withSpring(current, SPRING);
  }, [current, position]);

  // The pill is pushed along by a space before it, in a row that mirrors with the layout
  // direction: a width animates alike on every platform, where a logical margin does not on the web.
  const gap = useAnimatedStyle(() => ({ width: ROW_PADDING + pillStartAt(position.value, row) }));
  const pill = useAnimatedStyle(() => ({ width: activeWidthAt(position.value, row) }));

  return (
    <View
      className="absolute inset-x-0 bottom-0"
      style={{ height: tabBarSpace(bottomInset), pointerEvents: 'box-none' }}>
      <Fade bottomInset={bottomInset} />
      <View
        className="absolute inset-x-4 rounded-full shadow-float dark:border dark:border-border"
        style={{ bottom: barBottom(bottomInset), height: BAR_HEIGHT }}>
        <Backdrop />
        <View
          accessibilityRole="tablist"
          accessibilityLabel={t('tabBar')}
          onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
          className="flex-1 flex-row items-center"
          style={{ paddingHorizontal: ROW_PADDING }}>
          {active >= 0 ? (
            <View
              className="absolute inset-0 flex-row items-center"
              style={{ pointerEvents: 'none' }}>
              <Animated.View style={gap} />
              <Animated.View style={[styles.pill, pill]}>
                <View className="flex-1 rounded-full bg-primary" />
              </Animated.View>
            </View>
          ) : null}

          {items.map((item, index) => (
            <TabButton
              key={item.route}
              index={index}
              position={position}
              row={row}
              item={item}
              labelWidth={labelWidths[item.label] ?? 0}
              focused={index === active}
              onPress={() => onSelect(index)}
              onLongPress={() => onLongPress?.(index)}
            />
          ))}
        </View>

        {/* Each label measured at its full width, out of sight and out of the screen reader's way. */}
        <View
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute start-0 top-0 items-start opacity-0">
          {items.map((item) => (
            <Text
              key={item.route}
              variant="tab"
              numberOfLines={1}
              maxFontSizeMultiplier={LABEL_MAX_SCALE}
              onLayout={(event: LayoutChangeEvent) => {
                const width = Math.ceil(event.nativeEvent.layout.width) + MEASURE_SLACK;
                setLabelWidths((widths) =>
                  widths[item.label] === width ? widths : { ...widths, [item.label]: width }
                );
              }}>
              {item.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

type TabButtonProps = {
  index: number;
  position: SharedValue<number>;
  row: Row;
  item: TabItem;
  labelWidth: number;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function TabButton({
  index,
  position,
  row,
  item,
  labelWidth,
  focused,
  onPress,
  onLongPress,
}: TabButtonProps) {
  const t = useTranslations('shell');
  const count = item.count ?? 0;
  const spoken = count > 0 ? t('tabWithCount', { label: item.label, count }) : item.label;

  const size = useAnimatedStyle(() => ({ width: widthsAt(position.value, row)[index] ?? 0 }));
  // The icon turns from outline to filled and from dark to light as the pill reaches it.
  const resting = useAnimatedStyle(() => ({ opacity: 1 - focusOf(position.value, index) }));
  const reached = useAnimatedStyle(() => ({ opacity: focusOf(position.value, index) }));
  // The label unfolds beside the icon, folded away on the tabs that are not active. It is drawn
  // whole and the unfolding box cuts it off, so it never shows an ellipsis on the way; it is
  // hidden until measured and fades in over the second half of the slide.
  const shown = labelWidth > 0;
  const gap = labelGap(count);
  const unfold = useAnimatedStyle(() => {
    const focus = focusOf(position.value, index);
    return {
      width: focus * (gap + labelWidth),
      opacity: shown
        ? Math.min(Math.max((focus - LABEL_FADE_FROM) / (1 - LABEL_FADE_FROM), 0), 1)
        : 0,
    };
  });

  // The tab just chosen hops: its icon, with its badge, lifts and grows, then settles back.
  const hop = useSharedValue(0);
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) {
      hop.value = withSequence(withTiming(1, HOP_UP), withSpring(0, HOP_DOWN));
    }
    wasFocused.current = focused;
  }, [focused, hop]);
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -HOP_LIFT * hop.value }, { scale: 1 + HOP_GROW * hop.value }],
  }));

  return (
    <Animated.View style={size}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={
          item.dot && count === 0 ? t('tabWithNew', { label: item.label }) : spoken
        }
        onPress={onPress}
        onLongPress={onLongPress}
        className="h-12 flex-row items-center justify-center active:opacity-70">
        <Animated.View style={[styles.icon, lift]}>
          <Animated.View style={resting}>
            <Icon name={item.icon} size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, reached]}>
            <Icon
              name={item.icon}
              size={ICON_SIZE}
              strokeWidth={ICON_STROKE}
              filled
              colorClassName="accent-primary-foreground"
            />
          </Animated.View>
          <CountBadge count={count} className="absolute -end-2.5 -top-1.5" />
          {count === 0 ? (
            <DotBadge visible={item.dot ?? false} className="absolute -end-1 -top-0.5" />
          ) : null}
        </Animated.View>
        <Animated.View style={[styles.label, unfold]}>
          {/* The space before the label is a box of its own: a margin is lost in right-to-left layouts. */}
          <View style={{ width: gap }} />
          <Text
            variant="tab"
            numberOfLines={1}
            ellipsizeMode="clip"
            maxFontSizeMultiplier={LABEL_MAX_SCALE}
            className="shrink-0 text-primary-foreground"
            style={{ width: labelWidth + LABEL_ROOM, maxWidth: labelWidth + LABEL_ROOM }}>
            {item.label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The overlay behind the bar: from transparent at the top to the page's colour
 * half way down the bar, flat from there to the bottom of the screen. Content
 * scrolling under the bar fades out instead of being cut off.
 */
function Fade({ bottomInset }: { bottomInset: number }) {
  const background = String(useCSSVariable('--color-background') ?? '');
  const opaqueFrom = (FADE_HEIGHT + FADE_INTO_BAR * BAR_HEIGHT) / tabBarSpace(bottomInset);

  return (
    <LinearGradient
      colors={[transparentOf(background), background, background]}
      locations={[0, opaqueFrom, 1]}
      style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
    />
  );
}

/**
 * The bar's fill: `surface` at 80 % over a blur of what is behind it. Android
 * blurs only a view wrapped for the purpose, at a cost on older phones, so
 * there the fill is nearly solid instead.
 */
function Backdrop() {
  const { theme } = useUniwind();

  return (
    <View
      className="absolute inset-0 overflow-hidden rounded-full"
      style={{ pointerEvents: 'none' }}>
      {Platform.OS === 'android' ? (
        <View className="absolute inset-0 bg-surface/95" />
      ) : (
        <>
          <BlurView
            intensity={30}
            tint={theme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View className="absolute inset-0 bg-surface/80" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: ICON_SIZE, height: ICON_SIZE },
  pill: { height: PILL_HEIGHT },
  label: { flexDirection: 'row', overflow: 'hidden' },
});
