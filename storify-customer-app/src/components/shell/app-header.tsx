import { router } from 'expo-router';
import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

/**
 * The header of the app's screens: a round
 * back button at the start, the title in the centre, icon buttons at the end,
 * and a thin line under it, inset by the screen's gutter.
 *
 * The navigators draw it from each screen's options, so a screen says what its
 * header holds and never builds one:
 *
 * - `title`: the centred title;
 * - `headerTitle: () => <HeaderTitle icon="lock" title={…} />`: a title with an
 *   icon before it (Preferences, Security, Addresses);
 * - `headerTitle` with `headerTitleAlign: 'left'`: something that fills the
 *   space instead of a title (the search field);
 * - `headerRight: () => <HeaderButton … />`: buttons at the end;
 * - `headerBackVisible: false`: no back button; `headerTransparent: true`: no
 *   background and no line, over a screen's colour wash; `headerShadowVisible: false`:
 *   the background without the line;
 * - `presentation: 'modal'`: a sheet-like screen, closed by a button at the end.
 */
type AppHeaderProps = {
  title?: string;
  /** Drawn in place of the title. */
  titleView?: ReactNode;
  /** The title's space runs from the buttons at the start to those at the end, and starts at the start. */
  fill?: boolean;
  /** Shows the back button at the start. */
  onBack?: () => void;
  /** Shows a close button at the end. */
  onClose?: () => void;
  /** Buttons at the end, before the close button. */
  trailing?: ReactNode;
  /** No background and no line under the header. */
  transparent?: boolean;
  /** The line under the header; none over a transparent header. */
  line?: boolean;
  /** Space above the header: the status bar's, or none in a sheet. */
  topInset: number;
};

export function AppHeader({
  title,
  titleView,
  fill = false,
  onBack,
  onClose,
  trailing,
  transparent = false,
  line = true,
  topInset,
}: AppHeaderProps) {
  const t = useTranslations('shell');
  const end =
    trailing || onClose ? (
      <>
        {trailing}
        {onClose ? <HeaderButton icon="close" label={t('close')} onPress={onClose} /> : null}
      </>
    ) : null;

  return (
    <View className={cn(!transparent && 'bg-background')} style={{ paddingTop: topInset }}>
      <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
        {/* The two sides share the width left over, so the title sits in the true centre. */}
        <View className={cn('min-w-11 flex-row items-center', !fill && 'flex-1 basis-0')}>
          {onBack ? (
            <HeaderButton icon="arrow-left" directional label={t('back')} onPress={onBack} />
          ) : null}
        </View>
        <View className={cn('items-center', fill ? 'flex-1 items-stretch' : 'shrink')}>
          {titleView ?? (title ? <HeaderTitle title={title} /> : null)}
        </View>
        <View
          className={cn(
            'min-w-11 flex-row items-center justify-end gap-2',
            !fill && 'flex-1 basis-0'
          )}>
          {end}
        </View>
      </View>
      {transparent || !line ? null : <View className="mx-4 h-px bg-border" />}
    </View>
  );
}

type HeaderTitleProps = {
  title: string;
  /** An icon before the title. */
  icon?: IconName;
  /** A picture before the title, in place of an icon. */
  picture?: ReactNode;
};

/** A header's title, with an optional icon before it. */
export function HeaderTitle({ title, icon, picture }: HeaderTitleProps) {
  return (
    <View className="flex-row items-center gap-2">
      {picture ?? (icon ? <Icon name={icon} size={22} /> : null)}
      <Text
        variant="title"
        numberOfLines={2}
        accessibilityRole="header"
        className="shrink text-center">
        {title}
      </Text>
    </View>
  );
}

type HeaderButtonProps = {
  icon: IconName;
  /** What a screen reader says: the button has no words of its own. */
  label: string;
  onPress: () => void;
  /** Turns the icon around in a right-to-left layout (arrows). */
  directional?: boolean;
};

/**
 * A round button in a header: back, close, or an action. The circle is 33 pt;
 * the area that takes the tap is 45 pt.
 */
export function HeaderButton({ icon, label, onPress, directional }: HeaderButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="size-[33px] items-center justify-center rounded-full border border-transparent bg-surface shadow-button active:opacity-70 dark:border-border">
      <Icon name={icon} size={20} directional={directional} />
    </Pressable>
  );
}

const SHEETS = new Set(['modal', 'formSheet', 'pageSheet']);

/** Goes back, or, on a screen the app was opened on, to Home. */
function leave(navigation: { canGoBack: () => boolean; goBack: () => void }) {
  if (navigation.canGoBack()) navigation.goBack();
  else router.replace('/');
}

/**
 * The header of the screens pushed on a stack, from their options. The back
 * button is named "Back" for screen readers: the navigator's own button reads
 * the previous screen's name, which can be a route group's, "(tabs)".
 */
export function StackHeader({ options, navigation }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const sheet = SHEETS.has(options.presentation ?? 'card');
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : options.title;
  const onLeave = () => leave(navigation);

  return (
    <AppHeader
      title={title}
      titleView={
        typeof options.headerTitle === 'function'
          ? options.headerTitle({ children: title ?? '' })
          : undefined
      }
      fill={options.headerTitleAlign === 'left'}
      onBack={!sheet && options.headerBackVisible !== false ? onLeave : undefined}
      onClose={sheet ? onLeave : undefined}
      trailing={options.headerRight?.({ canGoBack: navigation.canGoBack() })}
      transparent={options.headerTransparent}
      line={options.headerShadowVisible !== false}
      // A sheet on iOS stands below the status bar already.
      topInset={sheet && Platform.OS === 'ios' ? 0 : insets.top}
    />
  );
}
