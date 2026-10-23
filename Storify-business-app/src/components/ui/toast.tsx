import { useEffect, useMemo } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Icon, type IconName, type IconTint } from './icon';
import { Text } from './text';

/**
 * The toast: a `foreground` pill with
 * `background` text, an optional tone icon at the start and one optional
 * action ("Undo", "View"). It floats above whatever is pinned to the bottom
 * (the tab bar, an action bar) and goes after about 4 s. One shows at a time;
 * a new one takes the place of the one before.
 *
 * A screen asks for one with `useToast().show(...)`. `ToastHost` draws it,
 * once, in the root layout.
 */

const SHOWN_MS = 4000;
/** Between the toast and what it floats above. */
const GAP = 12;

/** The icon at the start: done, or went wrong. Its colour is `background`, as the text's, on the dark pill. */
const TONES = {
  success: 'check-circle',
  danger: 'alert-circle',
  offline: 'wifi-off',
} as const satisfies Record<string, IconName>;

type ToastTone = keyof typeof TONES;

type ToastOptions = {
  /** What it says, already in the operator's language. */
  message: string;
  tone?: ToastTone;
  action?: { label: string; onPress: () => void };
};

type ToastState = {
  current: (ToastOptions & { id: number }) | null;
  /** How high each thing pinned to the bottom stands, by name; the toast floats above the highest. */
  lifts: Record<string, number>;
  show: (options: ToastOptions) => void;
  hide: () => void;
  setLift: (name: string, height: number | null) => void;
};

let lastId = 0;

const useToastStore = create<ToastState>((set) => ({
  current: null,
  lifts: {},
  show: (options) => set({ current: { ...options, id: ++lastId } }),
  hide: () => set({ current: null }),
  setLift: (name, height) =>
    set((state) => {
      const lifts = { ...state.lifts };
      if (height === null) delete lifts[name];
      else lifts[name] = height;
      return { lifts };
    }),
}));

/** Takes the toast away at once, wherever it is: before each test, which shares the store. */
export function dismissToast(): void {
  useToastStore.getState().hide();
}

export function useToast() {
  const show = useToastStore((state) => state.show);
  const hide = useToastStore((state) => state.hide);

  return useMemo(() => ({ show, hide }), [show, hide]);
}

/**
 * Tells the toast how high something pinned to the bottom of the screen
 * stands (the tab bar, an action bar), while it is on screen; `null` while it
 * is covered (the tab bar under a screen above the tabs).
 */
export function useToastLift(name: string, height: number | null): void {
  const setLift = useToastStore((state) => state.setLift);
  useEffect(() => {
    setLift(name, height);
    return () => setLift(name, null);
  }, [name, height, setLift]);
}

export function ToastHost() {
  const current = useToastStore((state) => state.current);
  const lifts = useToastStore((state) => state.lifts);
  const hide = useToastStore((state) => state.hide);
  const { bottom } = useSafeAreaInsets();
  const lift = Math.max(bottom, ...Object.values(lifts)) + GAP;

  // A screen reader says it as soon as it shows, wherever its focus is.
  useEffect(() => {
    if (current) AccessibilityInfo.announceForAccessibility(current.message);
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(hide, SHOWN_MS);
    return () => clearTimeout(timer);
  }, [current, hide]);

  if (!current) return null;

  return (
    <View
      style={{ paddingBottom: lift, pointerEvents: 'box-none' }}
      className="absolute inset-x-0 bottom-0 items-center px-4">
      <Animated.View
        key={current.id}
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(160)}>
        <ToastPill
          message={current.message}
          tone={current.tone}
          action={
            current.action
              ? {
                  label: current.action.label,
                  onPress: () => {
                    hide();
                    current.action?.onPress();
                  },
                }
              : undefined
          }
        />
      </Animated.View>
    </View>
  );
}

/** The pill itself, without the place it floats in. */
export function ToastPill({ message, tone, action }: ToastOptions) {
  const tint: IconTint = 'accent-background';

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="min-h-12 flex-row items-center gap-3 rounded-full bg-foreground py-2 ps-4 pe-3 shadow-float">
      {tone ? <Icon name={TONES[tone]} size={20} colorClassName={tint} /> : null}
      <Text className="shrink text-background">{message}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={4}
          onPress={action.onPress}
          className="min-h-11 justify-center px-2 active:opacity-70">
          <Text variant="label" className="text-background underline">
            {action.label}
          </Text>
        </Pressable>
      ) : (
        <View className="w-1" />
      )}
    </View>
  );
}
