import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

import { transparentOf } from '@/theme/color';

import { Button } from './button';
import { Divider } from './divider';
import { IconButton } from './icon-button';
import { RadioRow, RowGroup } from './rows';
import { Text } from './text';
import { FieldSurfaceProvider, TextField } from './text-field';

/**
 * Sheets: the house's bottom sheet, and the three
 * the app builds on it.
 *
 * - `Sheet`: a solid `surface` body with round top corners over a dark scrim
 *   (nothing blurs), a header with a centred title and a close button, a body
 *   that scrolls, and a footer that stays. It covers the tab bar.
 * - `ConfirmSheet`: the app's dialog. Bottom, not centred: the thumb is there.
 * - `PickerSheet`: one choice among several (a language, the theme, the
 *   workspace); choosing closes it.
 * - `ReasonSheet`: a confirm sheet that asks why (cancelling an order,
 *   rejecting an application); its button waits for a reason.
 *
 * The keyboard floats over the bottom of a sheet: the sheet never moves for
 * it, and the body scrolls a covered field up above the keyboard.
 */

/** Share of the screen a sheet may fill. */
const FIT_MAX = 0.9;
/** The sheet rises from this share of the screen below its place, eases in, and leaves a little quicker. */
const RISE = 0.3;
const OPEN_MS = 320;
const CLOSE_MS = 200;
/** How far above the keyboard a focused field is kept. */
const KEYBOARD_GAP = 24;
const FADE_HEIGHT = 24;

type SheetPanelProps = {
  /** Centred in the header. Without it the sheet has no header: a confirm sheet says its title in the body. */
  title?: string;
  onClose: () => void;
  /** A back button at the header's start, for a sheet that steps into a second screen (a filter's choices). */
  onBack?: () => void;
  /** Pinned under the body: the buttons. It carries the gutter and the home-indicator space. */
  footer?: ReactNode;
  children: ReactNode;
};

/** The sheet itself, without the layer that opens it. */
export function SheetPanel({ title, onClose, onBack, footer, children }: SheetPanelProps) {
  const t = useTranslations('common');
  const { height } = useWindowDimensions();

  // The panel is `surface`, so a field on it steps down to `surface-alt` to show.
  return (
    <FieldSurfaceProvider value="surface">
      <View
        style={{ maxHeight: height * FIT_MAX }}
        className="overflow-hidden rounded-t-sheet bg-surface">
        {title ? (
          <>
            <View className="min-h-16 flex-row items-center gap-2 px-4 py-3">
              <View className="w-11 items-start">
                {onBack ? (
                  <IconButton icon="arrow-left" label={t('back')} onPress={onBack} directional />
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
          </>
        ) : (
          // A handle: the sheet is a sheet, even with no header.
          <View className="items-center pt-2.5 pb-1">
            <View className="h-1 w-9 rounded-full bg-border" />
          </View>
        )}

        <View className="shrink">
          <KeyboardAwareScrollView
            bottomOffset={KEYBOARD_GAP}
            keyboardShouldPersistTaps="handled"
            className="grow-0"
            contentContainerClassName="px-4 pt-4 pb-4">
            {children}
          </KeyboardAwareScrollView>
          <BottomFade />
        </View>

        {footer ? (
          <View className="gap-3 px-4 pt-2 pb-safe-offset-4">{footer}</View>
        ) : (
          <View className="pb-safe-offset-2" />
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

type SheetProps = SheetPanelProps & {
  visible: boolean;
  /**
   * Called once the sheet has slid out and left the screen. What opens another
   * sheet waits for it: iOS presents one modal at a time, and refuses one asked
   * for while the last is still on its way out.
   */
  onClosed?: () => void;
};

/**
 * The sheet, opened over the screen. `visible` opens and closes it; the
 * operator closes it with the close button, a tap on the dimmed page, or the
 * back gesture, all of which call `onClose`.
 */
export function Sheet({ visible, onClose, onClosed, ...panel }: SheetProps) {
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
      onRequestClose={onClose}>
      <SheetStage
        open={visible}
        onDismiss={onClose}
        onClosed={() => {
          setShown(false);
          onClosed?.();
        }}>
        <SheetPanel onClose={onClose} {...panel} />
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
 * backwards, a little quicker.
 */
function SheetStage({ open, onDismiss, onClosed, children }: SheetStageProps) {
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
          className="flex-1 bg-scrim/60"
        />
      </Animated.View>
      <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

type ConfirmSheetProps = {
  visible: boolean;
  /** What will happen, as a question: "Cancel order #1042?" */
  title: string;
  /** One line on what it means: "The customer is told. This can't be undone." */
  body?: string;
  /** The committing step: "Cancel order". */
  confirmLabel: string;
  /** `danger` for a destructive step, `accent` for any other. */
  tone?: 'danger' | 'accent';
  /** The way out, which keeps things as they are: "Keep order". */
  cancelLabel: string;
  onConfirm: () => void;
  /** The way out, the scrim and the back gesture. */
  onCancel: () => void;
  /** The step is on its way: its button spins and the sheet stays. */
  loading?: boolean;
  /** Drawn between the text and the buttons: a field, a list of reasons. */
  children?: ReactNode;
  /** The committing button waits: no reason given yet. */
  confirmDisabled?: boolean;
  /** Called once the sheet has slid out: a step that takes the screen away waits for it. */
  onClosed?: () => void;
};

/**
 * The app's dialog: a start-aligned title, a line on what will happen, the
 * committing step on top (`danger` or `accent`) and the way out under it.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  tone = 'accent',
  cancelLabel,
  onConfirm,
  onCancel,
  loading = false,
  children,
  confirmDisabled = false,
  onClosed,
}: ConfirmSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClosed={onClosed}
      onClose={loading ? () => undefined : onCancel}
      footer={
        <>
          <Button
            label={confirmLabel}
            variant={tone}
            loading={loading}
            disabled={confirmDisabled}
            onPress={onConfirm}
          />
          <Button label={cancelLabel} variant="secondary" disabled={loading} onPress={onCancel} />
        </>
      }>
      <View className="gap-2">
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text className="text-muted">{body}</Text> : null}
      </View>
      {children ? <View className="mt-4">{children}</View> : null}
    </Sheet>
  );
}

export type PickerOption<T extends string> = {
  value: T;
  title: string;
  description?: string;
  leading?: ReactNode;
};

type PickerSheetProps<T extends string> = {
  visible: boolean;
  title: string;
  options: readonly PickerOption<T>[];
  value: T | null;
  /** Called with the chosen value, once the sheet has closed. */
  onChoose: (value: T) => void;
  onClose: () => void;
};

/**
 * One choice among several, as radio rows; choosing one closes the sheet. The
 * choice is handed over once the sheet has left the screen, so what it opens
 * next (a confirm sheet) can be presented.
 */
export function PickerSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onChoose,
  onClose,
}: PickerSheetProps<T>) {
  const chosen = useRef<T | null>(null);

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      onClosed={() => {
        const next = chosen.current;
        chosen.current = null;
        if (next !== null) onChoose(next);
      }}>
      <RowGroup bare accessibilityRole="radiogroup">
        {options.map((option) => (
          <RadioRow
            key={option.value}
            title={option.title}
            description={option.description}
            leading={option.leading}
            selected={option.value === value}
            onSelect={() => {
              if (option.value !== value) chosen.current = option.value;
              onClose();
            }}
            className="px-0"
          />
        ))}
      </RowGroup>
    </Sheet>
  );
}

type ReasonSheetProps<T extends string> = Omit<
  ConfirmSheetProps,
  'children' | 'confirmDisabled' | 'onConfirm'
> & {
  /** The reasons to choose from, the last of them "Other". Without any, the sheet asks for words only. */
  reasons?: readonly PickerOption<T>[];
  /** The reason that needs words of its own ("Other"). */
  otherValue?: T;
  /** The label of the field for the words. */
  noteLabel: string;
  /** The words are needed even with a reason chosen. */
  noteRequired?: boolean;
  onConfirm: (answer: { reason: T | null; note: string }) => void;
};

/**
 * A confirm sheet that asks why: radio rows of reasons and a field for words.
 * Its button waits until the store would have what it needs.
 */
export function ReasonSheet<T extends string>({
  reasons = [],
  otherValue,
  noteLabel,
  noteRequired = false,
  onConfirm,
  visible,
  ...sheet
}: ReasonSheetProps<T>) {
  const [reason, setReason] = useState<T | null>(null);
  const [note, setNote] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);

  // A sheet opened again starts empty.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason(null);
      setNote('');
    }
  }

  const needsNote =
    noteRequired || reasons.length === 0 || (reason !== null && reason === otherValue);
  const ready = (reasons.length === 0 || reason !== null) && (!needsNote || note.trim() !== '');

  return (
    <ConfirmSheet
      {...sheet}
      visible={visible}
      confirmDisabled={!ready}
      onConfirm={() => onConfirm({ reason, note: note.trim() })}>
      <View className="gap-4">
        {reasons.length > 0 ? (
          <RowGroup bare accessibilityRole="radiogroup">
            {reasons.map((option) => (
              <RadioRow
                key={option.value}
                title={option.title}
                description={option.description}
                selected={option.value === reason}
                onSelect={() => setReason(option.value)}
                className="px-0"
              />
            ))}
          </RowGroup>
        ) : null}
        {needsNote ? (
          <TextField label={noteLabel} value={note} onChangeText={setNote} multiline />
        ) : null}
      </View>
    </ConfirmSheet>
  );
}
