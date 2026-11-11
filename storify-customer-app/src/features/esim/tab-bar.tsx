import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useCSSVariable, useUniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { transparentOf } from '@/components/shell/fade-color';
import { tabBarSpace } from '@/components/shell/tab-bar';
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

/**
 * The store's tab bar: every tab shows its icon with its name under it, the
 * open one in the brand colour. It keeps the official bar's place and size
 * (a rounded bar floating above the bottom, 60 pt tall, a fade above it), so
 * the space screens leave for it (`useTabBarHeight` and the rest in
 * `components/shell/tab-bar.tsx`) still fits. Used by `app/(tabs)/_layout.tsx`
 * (patch P49) instead of the official `FloatingTabBar`.
 */

const BAR_HEIGHT = 60;
const FADE_HEIGHT = 24;
const FADE_INTO_BAR = 0.5;
const ICON_SIZE = 22;
/** Names stop growing past this text size, so they stay on one line in the bar. */
const LABEL_MAX_SCALE = 1.2;
/** Screens the bar steps aside for, as in the official bar: a conversation. */
const BARLESS_SCREENS = new Set(['account/inbox/[id]']);

type NavState = { index?: number; routes: { name: string; state?: NavState }[] };

function frontScreen(state: NavState | undefined): string | undefined {
  const route = state?.routes[state.index ?? state.routes.length - 1];
  if (!route) return undefined;
  return route.state ? (frontScreen(route.state) ?? route.name) : route.name;
}

type EsimTabBarProps = BottomTabBarProps & {
  tabs: NavItem<TabDestination>[];
  badges?: Partial<Record<BadgeKind, number>>;
};

export function EsimTabBar({ state, navigation, insets, tabs, badges = {} }: EsimTabBarProps) {
  const t = useTranslations();
  const tTabs = useTranslations('tabs');
  const tShell = useTranslations('shell');

  const entries = tabs.flatMap((item) => {
    const route = state.routes.find((candidate) => candidate.name === TAB_ROUTES[item.destination]);
    if (!route) return [];
    const { icon, labelKey, label } = describeItem(item);
    return [
      {
        route,
        icon,
        label: label ?? t(labelKey),
        badge: item.badge ? (badges[item.badge] ?? 0) : 0,
      },
    ];
  });
  const focusedKey = state.routes[state.index]?.key;
  const front = frontScreen(state as unknown as NavState);
  if (front && BARLESS_SCREENS.has(front)) return null;

  const bottom = insets.bottom;
  const space = tabBarSpace(bottom);
  const barBottom = space - BAR_HEIGHT - FADE_HEIGHT;

  const select = (route: (typeof entries)[number]['route']) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (route.key === focusedKey || event.defaultPrevented) return;
    // A tab opens on its first screen, as in the official bar.
    const stack = route.state;
    if (stack?.type === 'stack' && stack.key && (stack.index ?? 0) > 0) {
      navigation.dispatch({ type: 'POP_TO_TOP', target: stack.key });
    }
    navigation.navigate(route.name, route.params);
  };

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0"
      style={{ height: space }}>
      <Fade bottomInset={bottom} />
      <View
        className="absolute inset-x-4 rounded-full shadow-float"
        style={{ bottom: barBottom, height: BAR_HEIGHT }}>
        <Backdrop />
        <View
          accessibilityRole="tablist"
          accessibilityLabel={tShell('tabBar')}
          className="flex-1 flex-row items-center px-2">
          {entries.map(({ route, icon, label, badge }) => {
            const focused = route.key === focusedKey;
            return (
              <TabButton
                key={route.key}
                icon={icon}
                label={label}
                badge={badge}
                focused={focused}
                accessibilityLabel={badge > 0 ? tTabs('withItems', { label, count: badge }) : label}
                onPress={() => select(route)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabButton({
  icon,
  label,
  badge,
  focused,
  accessibilityLabel,
  onPress,
  onLongPress,
}: {
  icon: IconName;
  label: string;
  badge: number;
  focused: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      className="h-full flex-1 items-center justify-center gap-0.5 active:opacity-70">
      <View style={styles.icon}>
        <Icon
          name={icon}
          size={ICON_SIZE}
          filled={focused}
          colorClassName={focused ? 'accent-primary' : 'accent-muted'}
        />
        <CountBadge count={badge} max={99} className="absolute -end-2.5 -top-1.5" />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={LABEL_MAX_SCALE}
        className={focused ? 'text-[11px] font-semibold text-primary' : 'text-[11px] text-muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

/** From transparent above the bar to the page's colour, as in the official bar. */
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

/** The bar's fill: nearly solid on Android, a blur under a translucent fill elsewhere. */
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
  icon: { width: ICON_SIZE, height: ICON_SIZE },
});
