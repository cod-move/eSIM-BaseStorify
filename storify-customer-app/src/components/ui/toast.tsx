import { useEffect, useMemo } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { create } from 'zustand';

import { Text } from './text';

/**
 * The toast: a `foreground` pill with `background` text
 * and, when it helps, one action ("View cart", "Undo"). It sits above the tab
 * bar and goes after about 4 s. One shows at a time; a new one takes the place
 * of the one before.
 *
 * A screen asks for one with `useToast().show(...)`. `ToastHost` draws it, once,
 * in the app's providers.
 */

const SHOWN_MS = 4000;

type ToastOptions = {
  /** What it says, already in the shopper's language. */
  message: string;
  action?: { label: string; onPress: () => void };
};

type ToastState = {
  current: (ToastOptions & { id: number }) | null;
  show: (options: ToastOptions) => void;
  hide: () => void;
};

let lastId = 0;

const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (options) => set({ current: { ...options, id: ++lastId } }),
  hide: () => set({ current: null }),
}));

export function useToast() {
  const show = useToastStore((state) => state.show);
  const hide = useToastStore((state) => state.hide);

  return useMemo(() => ({ show, hide }), [show, hide]);
}

type ToastHostProps = {
  /**
   * How far the toast floats above the bottom edge of the screen, in points:
   * the space the tab bar takes there, home-indicator gap included.
   */
  bottomOffset: number;
};

export function ToastHost({ bottomOffset }: ToastHostProps) {
  const current = useToastStore((state) => state.current);
  const hide = useToastStore((state) => state.hide);

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
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0 px-4">
      <View
        pointerEvents="box-none"
        style={{ marginBottom: bottomOffset }}
        className="items-center">
        <ToastPill
          message={current.message}
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
      </View>
    </View>
  );
}

/** The pill itself, without the place it floats in. The kit gallery draws it on a page. */
export function ToastPill({ message, action }: ToastOptions) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="min-h-12 flex-row items-center gap-3 rounded-full bg-foreground py-2 ps-5 pe-3 shadow-float">
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
        <View className="w-2" />
      )}
    </View>
  );
}
