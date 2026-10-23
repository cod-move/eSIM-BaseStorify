import { router } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { RefreshControl, View, type LayoutChangeEvent } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { IconButton } from './icon-button';
import { Text } from './text';
import { useToastLift } from './toast';
import { Wash, type ScreenWash } from './wash';

/** The screen sits on a wash: its header lets it show through. */
const OnWash = createContext(false);

/**
 * The frame of every screen: the page colour,
 * the safe areas, a header, an optional scroll with pull to refresh, and room
 * at the bottom for the tab bar or a pinned action bar.
 */

/** Between the last row and what is pinned under it. */
const END_GAP = 24;

/**
 * What a screen keeps clear at the bottom of what it scrolls: the tab bar
 * where there is one, else the home indicator. A list (FlashList) adds it to
 * its content's bottom padding; `Screen` does it for its own scroll.
 */
export function useBottomSpace(): number {
  const tabBar = useTabBarHeight();
  const { bottom } = useSafeAreaInsets();
  return Math.max(tabBar, bottom) + END_GAP;
}

type ScreenProps = {
  /** A `TabHeader` or a `StackHeader`. */
  header?: ReactNode;
  /** The content scrolls (and lifts a focused field above the keyboard). A list screen leaves it off and scrolls its list. */
  scroll?: boolean;
  /** Pull to refresh, on a scrolling screen. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned under the content: an `ActionBar`. */
  footer?: ReactNode;
  /** Classes for the content: `gap-6 px-4`. */
  contentClassName?: string;
  /** The shopper app's soft gradient behind the whole screen: the Account tab and the account screen. */
  wash?: ScreenWash;
  children: ReactNode;
};

export function Screen({
  header,
  scroll = false,
  refreshing = false,
  onRefresh,
  footer,
  contentClassName,
  wash,
  children,
}: ScreenProps) {
  const bottom = useBottomSpace();

  return (
    <View className="flex-1 bg-background">
      {wash ? <Wash name={wash} /> : null}
      <OnWash value={Boolean(wash)}>{header}</OnWash>
      {scroll ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerClassName={contentClassName}
          contentContainerStyle={{ paddingBottom: footer ? END_GAP : bottom }}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }>
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View className={cn('flex-1', contentClassName)}>{children}</View>
      )}
      {footer}
    </View>
  );
}

type TabHeaderProps = {
  /** The tab's name, in `title-large`. */
  title?: string;
  /** Drawn in the title's place: Home's workspace. */
  titleView?: ReactNode;
  /** Round buttons at the end: search, scan, filter. */
  actions?: ReactNode;
};

/** The header of a tab's own screen: the title at the start, actions at the end, under the status bar. */
export function TabHeader({ title, titleView, actions }: TabHeaderProps) {
  return (
    <View className="flex-row items-center gap-3 px-4 pt-safe-offset-3 pb-3">
      <View className="flex-1">
        {titleView ?? (
          <Text variant="title-large" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      {actions ? <View className="flex-row items-center gap-2">{actions}</View> : null}
    </View>
  );
}

type StackHeaderProps = {
  title?: string;
  /** Drawn before the title, as the shopper app's settings pages: "lock" for Security. */
  icon?: IconName;
  /** Up to two round buttons at the end. */
  actions?: ReactNode;
  /** Where back goes; by default the screen before, or Home when there is none (a link opened it). */
  onBack?: () => void;
  /** A close button instead of back: a modal. */
  close?: boolean;
};

/** The header of a screen above the tabs: back at the start, the title in the centre, actions at the end. */
export function StackHeader({ title, icon, actions, onBack, close = false }: StackHeaderProps) {
  const t = useTranslations('common');
  const onWash = useContext(OnWash);
  const back =
    onBack ??
    (() => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });

  return (
    <View className={cn('pt-safe', !onWash && 'bg-background')}>
      <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
        {/* The two sides share the width left over, so the title sits in the true centre. */}
        <View className="min-w-10 flex-1 basis-0 flex-row items-center">
          <IconButton
            icon={close ? 'close' : 'arrow-left'}
            directional={!close}
            label={close ? t('close') : t('back')}
            onPress={back}
          />
        </View>
        <View className="shrink flex-row items-center gap-2">
          {icon ? <Icon name={icon} size={22} /> : null}
          <Text
            variant="title"
            accessibilityRole="header"
            numberOfLines={1}
            className="shrink text-center">
            {title}
          </Text>
        </View>
        <View className="min-w-10 flex-1 basis-0 flex-row items-center justify-end gap-2">
          {actions}
        </View>
      </View>
    </View>
  );
}

/**
 * The steps a detail screen offers, pinned to the bottom:
 * a `surface` panel above the home indicator, holding one or two buttons, the
 * committing one first.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState(0);
  // The toast floats above the bar.
  useToastLift('action-bar', height);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height)}
      className="gap-3 bg-surface px-4 pt-3 pb-safe-offset-3 shadow-bar dark:border-t dark:border-border">
      {children}
    </View>
  );
}
