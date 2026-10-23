import { LinearGradient } from 'expo-linear-gradient';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useCSSVariable } from 'uniwind';
import { useTranslations } from 'use-intl';

import { transparentOf } from '@/components/shell/fade-color';

import { Divider } from './divider';
import { IconButton } from './icon-button';
import { Text } from './text';
import { FieldSurfaceProvider } from './text-field';

/**
 * The bottom sheet: a solid `surface` body with
 * round top corners over a dark `scrim` (nothing blurs and nothing shows
 * through: Android draws no backdrop blur), a header with a centred title, a
 * close button at the end and, in a sub-sheet, a back button at the start, a
 * body that scrolls, and a footer that stays where it is.
 *
 * It opens above everything, the tab bar included, and dims the page behind it.
 * Its height fits its content up to 90 % of the screen; a `tall` sheet (a
 * detail, a sign-in step) starts about 55 pt from the top.
 *
 * The keyboard floats over the bottom of the sheet: the sheet never moves for
 * it, and the body scrolls a covered field up above the keyboard.
 */

/** Share of the screen a sheet may fill, and the one a tall sheet does. */
const FIT_MAX = 0.9;
const TALL = 0.93;
/** The sheet rises from this share of the screen below its place, eases in, and leaves a little quicker. */
const RISE = 0.3;
const OPEN_MS = 340;
const CLOSE_MS = 220;
/** How far above the keyboard a focused field is kept. */
const KEYBOARD_GAP = 24;
/** The height of the fade at the body's bottom edge. */
const FADE_HEIGHT = 24;

type SheetSize = 'fit' | 'tall';

type SheetContentProps = {
  title: string;
  onClose: () => void;
  /** A back button at the start, for a sheet opened from another sheet. */
  onBack?: () => void;
  /** Pinned under the body: the Apply button, a pair of buttons. It carries the gutter and the home-indicator space. */
  footer?: ReactNode;
  size?: SheetSize;
  /** The height of the space the sheet sits in, where that is not the screen (the kit gallery). */
  frameHeight?: number;
  children: ReactNode;
};

/**
 * The sheet itself, without the layer that opens it. `Sheet` is this in a
 * modal; the kit gallery draws it in place so it can be seen next to the design.
 */
export function SheetPanel({
  title,
  onClose,
  onBack,
  footer,
  size = 'fit',
  frameHeight,
  children,
}: SheetContentProps) {
  const t = useTranslations('common');
  const screen = useWindowDimensions().height;
  const height = frameHeight ?? screen;
  const tall = size === 'tall';

  // The panel is `surface`, so a field on it steps down to `surface-alt` to show.
  return (
    <FieldSurfaceProvider value="surface">
      <View
        style={tall ? { height: height * TALL } : { maxHeight: height * FIT_MAX }}
        className="overflow-hidden rounded-t-sheet bg-surface">
        <View className="min-h-16 flex-row items-center gap-2 px-4 py-3">
          <View className="w-11 items-start">
            {onBack ? (
              <IconButton icon="arrow-left" directional label={t('back')} onPress={onBack} />
            ) : null}
          </View>
          <Text
            variant="title"
            numberOfLines={2}
            accessibilityRole="header"
            className="flex-1 text-center">
            {title}
          </Text>
          <View className="w-11 items-end">
            <IconButton icon="close" label={t('close')} onPress={onClose} />
          </View>
        </View>
        <Divider />

        <View className={tall ? 'flex-1' : 'shrink'}>
          <KeyboardAwareScrollView
            bottomOffset={KEYBOARD_GAP}
            keyboardShouldPersistTaps="handled"
            className={tall ? 'grow' : 'grow-0'}
            contentContainerClassName="px-4 pt-4 pb-6">
            {children}
          </KeyboardAwareScrollView>
          <BottomFade />
        </View>

        {footer ? (
          <View className="px-4 pt-3 pb-safe-offset-4">{footer}</View>
        ) : (
          <View className="pb-safe" />
        )}
      </View>
    </FieldSurfaceProvider>
  );
}

/** The body fades out into the panel at its bottom edge, so scrolled content does not end on a hard line. */
function BottomFade() {
  const surface = String(useCSSVariable('--color-surface') ?? '');

  return (
    <View
      className="absolute inset-x-0 bottom-0"
      style={{ height: FADE_HEIGHT, pointerEvents: 'none' }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <LinearGradient colors={[transparentOf(surface), surface]} style={{ flex: 1 }} />
    </View>
  );
}

type SheetProps = SheetContentProps & {
  visible: boolean;
};

/**
 * The sheet, opened over the screen. `visible` opens and closes it; the shopper
 * closes it with the close button, a tap on the dimmed page, or the back
 * gesture, all of which call `onClose` (the back gesture calls `onBack` in a
 * sub-sheet, which steps out one level).
 */
export function Sheet({ visible, onClose, onBack, ...panel }: SheetProps) {
  const [shown, setShown] = useState(visible);

  // Stays in the tree through the slide out, then leaves it.
  if (visible && !shown) setShown(true);

  return (
    <Modal
      transparent
      animationType="none"
      visible={shown}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onBack ?? onClose}>
      <SheetStage open={visible} onDismiss={onClose} onClosed={() => setShown(false)}>
        <SheetPanel onClose={onClose} onBack={onBack} {...panel} />
      </SheetStage>
    </Modal>
  );
}

type SheetStageProps = {
  /** True slides the sheet in; false slides it out, then calls `onClosed`. */
  open: boolean;
  /** A tap on the page behind. */
  onDismiss: () => void;
  onClosed?: () => void;
  children: ReactNode;
};

/**
 * What every sheet stands on: the page behind dims to a dark scrim while the
 * sheet rises from below and fades in, easing to rest; closing runs it
 * backwards, a little quicker. A sheet that is a route of its own (sign-in,
 * Change Password) uses this too, closing first and leaving the route after.
 */
export function SheetStage({ open, onDismiss, onClosed, children }: SheetStageProps) {
  const t = useTranslations('common');
  const { height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  // `onClosed` is a new function on every render; the motion follows `open` alone.
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  });

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? OPEN_MS : CLOSE_MS,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => {
      if (finished && !open) closed.current?.();
    });
    return () => animation.stop();
  }, [open, progress]);

  const rise = progress.interpolate({ inputRange: [0, 1], outputRange: [height * RISE, 0] });
  // The sheet is fully opaque a little before it lands, so the fade never shows through its content.
  const fade = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });

  return (
    <View className="flex-1 justify-end">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          onPress={onDismiss}
          className="flex-1 bg-scrim/80"
        />
      </Animated.View>
      {/* No keyboard avoiding here: the keyboard floats over the sheet's bottom. */}
      <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

/** A footer of buttons side by side, each taking its share of the width: Reset and Apply. */
export function SheetActions({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row gap-3">
      {Children.map(children, (child) => (
        <View className="flex-1">{child}</View>
      ))}
    </View>
  );
}
