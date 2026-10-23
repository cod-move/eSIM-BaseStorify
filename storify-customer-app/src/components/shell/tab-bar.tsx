import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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

import { CountBadge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  describeItem,
  TAB_ROUTES,
  type BadgeKind,
  type NavItem,
  type TabDestination,
} from '@/config/app-layout';

import { transparentOf } from './fade-color';

/**
 * The floating tab bar.
 *
 * A pill that floats above the bottom of the screen, with no border and no
 * panel behind it: the page's content runs under it, seen softened through a
 * translucent fill over a blur, and an overlay gradient from transparent to the
 * page's colour fades it out, so that nothing meets a hard edge above, behind
 * or below the bar. The active tab is a dark pill holding its icon and label;
 * the others show their icon only, and their label is still read by screen
 * readers. On a change of tab the pill springs to the new one, growing and
 * shrinking with the tabs on its way.
 */

/** The bar's height. */
const BAR_HEIGHT = 60;
/** Below the bar on a phone with no home indicator. */
const MIN_BOTTOM_GAP = 16;
/** The bar floats this much higher than the home indicator or the gap, clear of the gesture area. */
const LIFT = 10;
/**
 * The fade above the bar, from transparent to the page's colour. Short, so that a panel pinned
 * above it (`usePinnedPanelPadding`) does not stand far from the bar.
 */
const FADE_HEIGHT = 24;
/** Between the fade's top edge and what a pinned panel keeps above it. */
const PANEL_GAP = 10;
/** Under a pinned panel's content when there is no bar: the home indicator, at least this much. */
const PANEL_MIN_BOTTOM = 12;
/** How far down the bar the fade has reached the page's colour in full, as a share of the bar's height. */
const FADE_INTO_BAR = 0.5;
/** The gap between the screen's edge and the bar's (its `inset-x-4`). */
const BAR_MARGIN = 16;
/** Between the bar's edge and the active pill: (60 − 46 pt pill) / 2. */
const ROW_PADDING = 7;
const PILL_HEIGHT = 46;
/** The narrowest a tab may be: the smallest area a finger can be asked to hit. */
const MIN_TAB_WIDTH = 44;
const ICON_SIZE = 24;
const LABEL_GAP = 8;
/** How far the count badge reaches past the icon's end edge (its `-end-2.5`): the label starts beyond it. */
const BADGE_REACH = 10;
/**
 * Added to a label's measured width. The web reports a layout's width in whole
 * pixels, rounded to the nearest, so up to half a pixel short of the text: a
 * label given exactly that much room ends in an ellipsis.
 */
const MEASURE_SLACK = 1;
/** Inside the active pill, before the icon and after the label. */
const PILL_PADDING = 16;
/** The bar is 60 pt tall whatever the text size; past this, its labels stop growing. */
const LABEL_MAX_SCALE = 1.3;
/**
 * About 350 ms to settle, smooth and without overshoot.
 * With the phone set to reduce motion the pill jumps to the new tab instead.
 */
const SPRING = { stiffness: 260, damping: 30, mass: 1, reduceMotion: ReduceMotion.System } as const;
/** The room a visible label's text is given beyond its measured width: the tab clips it, never an ellipsis. */
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
export function tabBarSpace(bottomInset: number): number {
  return barBottom(bottomInset) + BAR_HEIGHT + FADE_HEIGHT;
}

/**
 * The space a screen under the bar leaves at the bottom of what it scrolls, so
 * that its last row can scroll clear of the bar and of the fade above it: the
 * tabs and every screen pushed in a tab, checkout among them. Zero on a screen
 * over the bar (sign-in, a sheet), where there is no bar.
 */
export function useTabBarHeight(): number {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const { bottom } = useSafeAreaInsets();
  return inTabs ? tabBarSpace(bottom) : 0;
}

/**
 * How high the bar's top edge stands from the bottom of the screen, for
 * something pinned just above the bar (the product page's bar). Zero on a
 * screen over the bar.
 */
export function useTabBarTop(): number {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const { bottom } = useSafeAreaInsets();
  return inTabs ? barBottom(bottom) + BAR_HEIGHT : 0;
}

/**
 * The padding under the content of a panel pinned at the foot of a screen, in
 * the flow under what scrolls (the cart's Total and Proceed, checkout's Total
 * and Place order): the content stands clear above the bar's fade, a small gap
 * between, and the panel's own background runs on down behind the fade and the
 * bar, so that nothing is washed out by the fade and nothing ends in an edge.
 * With no bar, it is the phone's home indicator.
 */
export function usePinnedPanelPadding(): number {
  const tabBar = useTabBarHeight();
  const { bottom } = useSafeAreaInsets();
  return tabBar > 0 ? tabBar + PANEL_GAP : Math.max(bottom, PANEL_MIN_BOTTOM);
}

/**
 * What a screen keeps clear at the bottom of what it scrolls: the tab bar
 * where there is one, else the phone's home indicator.
 */
export function useBottomSpace(): number {
  const tabBar = useTabBarHeight();
  const { bottom } = useSafeAreaInsets();
  return Math.max(tabBar, bottom);
}

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

/** The room between the icon and the label: past the badge, on a tab that shows one. */
function labelGap(badge: number): number {
  return badge > 0 ? BADGE_REACH + LABEL_GAP : LABEL_GAP;
}

/** `position` held to the tabs there are, so that a spring's overshoot past either end moves nothing. */
function withinTabs(position: number, row: Row): number {
  'worklet';
  return Math.min(Math.max(position, 0), row.activeWidths.length - 1);
}

/** Where tab `index` starts, from the start of the row, while it is the active one: the tabs before it are as wide as the others. */
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
  const progress = clamped - from;
  const start = row.activeWidths[from] ?? 0;
  return start + ((row.activeWidths[to] ?? 0) - start) * progress;
}

/** Every tab's width: the inactive ones share what the active one leaves. */
function widthsAt(position: number, row: Row): number[] {
  'worklet';
  const clamped = withinTabs(position, row);
  const active = activeWidthAt(clamped, row);
  const others = Math.max(row.activeWidths.length - 1, 1);
  const inactive = (row.inner - active) / others;
  return row.activeWidths.map(
    (_, index) => inactive + (active - inactive) * focusOf(clamped, index)
  );
}

/**
 * The pill's start edge, from the start of the row: between where the two tabs it is moving between start when
 * they are the active one. The tabs' own widths vary on the way (the one it leaves narrows as the one it
 * reaches grows), so an edge read from them moves back before it arrives, at the last tab above all: this
 * one only ever moves toward the tab it reaches, the same either way along the row.
 */
function pillStartAt(position: number, row: Row): number {
  'worklet';
  const clamped = withinTabs(position, row);
  const from = Math.floor(clamped);
  const to = Math.min(from + 1, row.activeWidths.length - 1);
  const start = restStartOf(from, row);
  return start + (restStartOf(to, row) - start) * (clamped - from);
}

type FloatingTabBarProps = BottomTabBarProps & {
  /** The layout's tabs, in order (`APP_LAYOUT.tabs`). */
  tabs: NavItem<TabDestination>[];
  /** The numbers on the tabs' badges. Zero shows no badge. */
  badges?: Partial<Record<BadgeKind, number>>;
};

/** Screens the bar steps aside for, by route name: a conversation, whose field sits where the bar would. */
const BARLESS_SCREENS = new Set(['account/inbox/[id]']);

type NavState = { index?: number; routes: { name: string; state?: NavState }[] };

/** The screen in front, however deep in the tab's stack it is. */
function frontScreen(state: NavState | undefined): string | undefined {
  const route = state?.routes[state.index ?? state.routes.length - 1];
  if (!route) return undefined;
  return route.state ? (frontScreen(route.state) ?? route.name) : route.name;
}

/** The bar of the tab navigator: the layout's tabs whose screen exists, and a press that goes to that screen. */
export function FloatingTabBar({
  state,
  navigation,
  insets,
  tabs,
  badges = {},
}: FloatingTabBarProps) {
  const t = useTranslations();

  const entries = tabs.flatMap((item) => {
    const route = state.routes.find((candidate) => candidate.name === TAB_ROUTES[item.destination]);
    if (!route) return [];
    const { icon, labelKey, label } = describeItem(item);
    return [{ route, icon, label: label ?? t(labelKey), badge: item.badge }];
  });
  const focusedKey = state.routes[state.index]?.key;
  const front = frontScreen(state as unknown as NavState);
  if (front && BARLESS_SCREENS.has(front)) return null;

  return (
    <TabBarView
      items={entries.map(({ icon, label, badge }) => ({
        icon,
        label,
        badge: badge ? (badges[badge] ?? 0) : 0,
      }))}
      active={entries.findIndex((entry) => entry.route.key === focusedKey)}
      bottomInset={insets.bottom}
      onSelect={(index) => {
        const route = entries[index]?.route;
        if (!route) return;
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (route.key !== focusedKey && !event.defaultPrevented) {
          // A tab always opens on its first screen, never on one left open in it: its
          // stack, once it has one, is popped before the tab shows. (A tap on the tab
          // that is open is the stack's own: it listens for the `tabPress` above.)
          const stack = route.state;
          if (stack?.type === 'stack' && stack.key && (stack.index ?? 0) > 0) {
            navigation.dispatch({ type: 'POP_TO_TOP', target: stack.key });
          }
          navigation.navigate(route.name, route.params);
        }
      }}
      onLongPress={(index) => {
        const route = entries[index]?.route;
        if (route) navigation.emit({ type: 'tabLongPress', target: route.key });
      }}
    />
  );
}

type TabBarViewProps = {
  items: { icon: IconName; label: string; badge: number }[];
  /** The index of the tab that is open; -1 when none of them is. */
  active: number;
  /** The phone's home indicator (the safe area's bottom inset). */
  bottomInset: number;
  onSelect: (index: number) => void;
  onLongPress?: (index: number) => void;
};

/** The bar itself, knowing nothing of navigators: the kit gallery drives it by hand. */
export function TabBarView({ items, active, bottomInset, onSelect, onLongPress }: TabBarViewProps) {
  const t = useTranslations('shell');
  const { width: windowWidth } = useWindowDimensions();
  const [measuredRowWidth, setMeasuredRowWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const current = Math.max(active, 0);

  // The active tab is as wide as its icon and label, but leaves every other tab a finger's width.
  // Before the bar has laid out (the first frame, possibly under the launch cover) its width is the window's less
  // its margins, never zero; and until every label is measured the tabs are equal, so the icons are in place from
  // the first frame and only the active label waits.
  const rowWidth = measuredRowWidth > 0 ? measuredRowWidth : windowWidth - 2 * BAR_MARGIN;
  const inner = Math.max(rowWidth - 2 * ROW_PADDING, 0);
  const labelsMeasured = items.every((item) => labelWidths[item.label] !== undefined);
  const row: Row = {
    inner,
    activeWidths: items.map((item) =>
      labelsMeasured
        ? Math.min(
            ICON_SIZE + labelGap(item.badge) + (labelWidths[item.label] ?? 0) + 2 * PILL_PADDING,
            inner - (items.length - 1) * MIN_TAB_WIDTH
          )
        : inner / Math.max(items.length, 1)
    ),
  };

  const position = useSharedValue(current);
  useEffect(() => {
    position.value = withSpring(current, SPRING);
  }, [current, position]);

  // The pill is pushed along by a space before it, in a row that mirrors with the layout direction. A width is
  // what every platform animates alike (a logical margin is not, on the web).
  const gap = useAnimatedStyle(() => ({ width: ROW_PADDING + pillStartAt(position.value, row) }));
  const pill = useAnimatedStyle(() => ({ width: activeWidthAt(position.value, row) }));

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0"
      style={{ height: tabBarSpace(bottomInset) }}>
      <Fade bottomInset={bottomInset} />
      <View
        className="absolute inset-x-4 rounded-full shadow-float"
        style={{ bottom: barBottom(bottomInset), height: BAR_HEIGHT }}>
        <Backdrop />
        <View
          accessibilityRole="tablist"
          accessibilityLabel={t('tabBar')}
          onLayout={(event: LayoutChangeEvent) =>
            setMeasuredRowWidth(event.nativeEvent.layout.width)
          }
          className="flex-1 flex-row items-center px-[7px]">
          {/* The active pill, behind the tabs. */}
          <View pointerEvents="none" className="absolute inset-0 flex-row items-center">
            <Animated.View style={gap} />
            <Animated.View style={[styles.pill, pill]}>
              <View className="flex-1 rounded-full bg-primary" />
            </Animated.View>
          </View>

          {items.map((item, index) => (
            <TabButton
              key={item.label}
              index={index}
              position={position}
              row={row}
              icon={item.icon}
              label={item.label}
              labelWidth={labelWidths[item.label] ?? 0}
              badge={item.badge}
              focused={index === active}
              onPress={() => onSelect(index)}
              onLongPress={() => onLongPress?.(index)}
            />
          ))}
        </View>

        {/* Each label measured at its full width, out of sight and out of the screen reader's way, and again
            whenever its layout changes. */}
        <View
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute start-0 top-0 items-start opacity-0">
          {items.map((item) => (
            <Text
              key={item.label}
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
  icon: IconName;
  label: string;
  labelWidth: number;
  badge: number;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function TabButton({
  index,
  position,
  row,
  icon,
  label,
  labelWidth,
  badge,
  focused,
  onPress,
  onLongPress,
}: TabButtonProps) {
  const t = useTranslations('tabs');

  const size = useAnimatedStyle(() => ({ width: widthsAt(position.value, row)[index] ?? 0 }));
  // The icon turns from outline to filled and from dark to light as the pill reaches it.
  const resting = useAnimatedStyle(() => ({ opacity: 1 - focusOf(position.value, index) }));
  const reached = useAnimatedStyle(() => ({ opacity: focusOf(position.value, index) }));
  // The label unfolds beside the icon, every one kept in place and folded away on the tabs that are not active.
  // It is drawn whole and the unfolding box cuts it off, so it never shows an ellipsis on the way, nor before
  // its width is measured; it is hidden until then and fades in over the second half of the slide, once most
  // of it is in view.
  const measured = labelWidth > 0;
  const gap = labelGap(badge);
  const unfold = useAnimatedStyle(() => {
    const focus = focusOf(position.value, index);
    return {
      width: focus * (gap + labelWidth),
      opacity: measured
        ? Math.min(Math.max((focus - LABEL_FADE_FROM) / (1 - LABEL_FADE_FROM), 0), 1)
        : 0,
    };
  });

  // The tab just chosen hops: its icon, with its badge, lifts and grows, then bounces back into place.
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
        accessibilityLabel={badge > 0 ? t('withItems', { label, count: badge }) : label}
        onPress={onPress}
        onLongPress={onLongPress}
        className="h-12 flex-row items-center justify-center active:opacity-70">
        <Animated.View style={[styles.icon, lift]}>
          <Animated.View style={resting}>
            <Icon name={icon} size={ICON_SIZE} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, reached]}>
            <Icon name={icon} size={ICON_SIZE} filled colorClassName="accent-primary-foreground" />
          </Animated.View>
          <CountBadge count={badge} max={99} className="absolute -end-2.5 -top-1.5" />
        </Animated.View>
        <Animated.View style={[styles.label, unfold]}>
          {/* The space between the icon (and its badge) and the label is a box of its own, not the text's
              margin: a margin was lost in the right-to-left layout, and the label touched the icon. */}
          <View style={{ width: gap }} />
          {/* Its own width, never the unfolding box's: a browser keeps a one-line text within its box
              unless told otherwise, and would end it in an ellipsis. It is given room beyond its measured
              width, so that a measurement still short of the text (taken before the text was shaped) leaves
              nothing to end in an ellipsis: the box clips it. */}
          <Text
            variant="tab"
            numberOfLines={1}
            ellipsizeMode="clip"
            maxFontSizeMultiplier={LABEL_MAX_SCALE}
            className="shrink-0 text-primary-foreground"
            style={{
              width: labelWidth + LABEL_ROOM,
              maxWidth: labelWidth + LABEL_ROOM,
            }}>
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The overlay behind the bar: from transparent at the top to the page's colour
 * half way down the bar, and the page's colour, flat, from there to the bottom
 * of the screen. Content scrolling under the bar fades out instead of being cut
 * off, and the gap under the bar shows no ghost of it, no panel and no edge.
 */
function Fade({ bottomInset }: { bottomInset: number }) {
  const background = String(useCSSVariable('--color-background') ?? '');
  const opaqueFrom = (FADE_HEIGHT + FADE_INTO_BAR * BAR_HEIGHT) / tabBarSpace(bottomInset);

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[transparentOf(background), background, background]}
      locations={[0, opaqueFrom, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
}

/**
 * The bar's fill: `surface` at 80 % over a blur of what is behind it. Android
 * blurs only a view wrapped for the purpose, at a cost on older phones
 * (expo-blur, SDK 57), so there the fill is nearly solid instead.
 */
function Backdrop() {
  const { theme } = useUniwind();

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden rounded-full">
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
  icon: { width: 22, height: 22 },
  pill: { height: PILL_HEIGHT },
  label: { flexDirection: 'row', overflow: 'hidden' },
});
