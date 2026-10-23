import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * The motion every control shares: a press that gives
 * under the finger and springs back, and a pop for something that has just
 * changed. The springs run on the UI thread.
 *
 * Nothing here sets `reduceMotion`: Reanimated's default, `ReduceMotion.System`,
 * jumps each animation to its end on a phone set to reduce motion.
 */

/** How far a pressed control gives: a button, a card. */
const PRESS_SCALE = 0.96;
/**
 * How far a small round control gives (a heart, a card's cart button, a back
 * button). Four per cent of 30 pt is a pixel, which no one sees.
 */
export const ROUND_PRESS_SCALE = 0.88;

/** Down at once and almost without a bounce, while the finger is on it. */
const PRESS_IN = { stiffness: 700, damping: 40, mass: 1 } as const;
/** Back with a light overshoot when the finger lifts. */
const RELEASE = { stiffness: 380, damping: 15, mass: 1 } as const;
/** How quickly a pop reaches its peak. */
const POP_UP = { duration: 110, easing: Easing.out(Easing.quad) } as const;
/** From a pop's peak back to rest, in a few short bounces. */
const SETTLE = { stiffness: 340, damping: 12, mass: 1 } as const;

/**
 * A press that gives: `scale` springs to `to` while the finger is down and
 * back to 1, with a light overshoot, when it lifts. Draw `scale` in an
 * animated style; a control that moves for another reason too multiplies the
 * two (the cart button's bump).
 */
export function usePressScale(to: number = PRESS_SCALE) {
  const scale = useSharedValue(1);

  return {
    scale,
    onPressIn: () => {
      scale.value = withSpring(to, PRESS_IN);
    },
    onPressOut: () => {
      scale.value = withSpring(1, RELEASE);
    },
  };
}

/**
 * A scale that jumps to `peak` and springs back to 1: up past 1 to pop
 * (a badge's new number, a heart filling), under 1 to shrink back.
 */
export function pop(peak: number): number {
  return withSequence(withTiming(peak, POP_UP), withSpring(1, SETTLE));
}

/** A `Pressable` that takes Reanimated's animated styles. */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far it gives: `PRESS_SCALE` unless said otherwise. */
  scaleTo?: number;
};

/**
 * A `Pressable` that gives under the finger. It is the same box, with the same
 * classes and the same accessibility; only a transform is added, so it takes
 * no more room than before.
 */
export function PressableScale({
  scaleTo,
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const press = usePressScale(scaleTo);
  const { scale } = press;
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        press.onPressIn();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        press.onPressOut();
        onPressOut?.(event);
      }}
      style={[style, pressed]}
    />
  );
}
