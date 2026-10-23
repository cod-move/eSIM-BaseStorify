import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppImage } from '@/components/ui/app-image';

/** How far a picture zooms in: by pinching, and by a double tap. */
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** A drag this far down (or up), or this fast, closes the viewer when the picture is not zoomed. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
/** How far a drag towards closing goes before the backdrop has faded as far as it will. */
const FADE_DISTANCE = 400;

type ZoomablePictureProps = {
  url: string;
  /** What a screen reader says the picture is. */
  label: string;
  onDismiss: () => void;
  /** A single tap: shows or hides what sits over the picture. */
  onTap: () => void;
  onLoad: () => void;
  onError: () => void;
};

/**
 * A picture filling the screen, whole (`contain`), on its dark backdrop: pinch
 * to zoom, drag to look around once zoomed, double-tap to zoom in where tapped
 * or back out, and, at its own size, drag it away up or down to close, the
 * backdrop fading to the screen underneath as it goes.
 */
export function ZoomablePicture({
  url,
  label,
  onDismiss,
  onTap,
  onLoad,
  onError,
}: ZoomablePictureProps) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // How far the picture has been dragged towards closing.
  const drag = useSharedValue(0);

  // At a scale, how far the picture may move before its edge leaves the screen's.
  const limitX = (at: number) => {
    'worklet';
    return (width * (at - 1)) / 2;
  };
  const limitY = (at: number) => {
    'worklet';
    return (height * (at - 1)) / 2;
  };
  const clamp = (value: number, limit: number) => {
    'worklet';
    return Math.min(Math.max(value, -limit), limit);
  };
  const zoomTo = (to: number, toX: number, toY: number) => {
    'worklet';
    scale.value = withTiming(to);
    x.value = withTiming(clamp(toX, limitX(to)));
    y.value = withTiming(clamp(toY, limitY(to)));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(startScale.value * event.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      // Back inside the screen's edges at the scale the fingers left.
      zoomTo(scale.value, x.value, y.value);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      if (scale.value > 1) {
        x.value = clamp(startX.value + event.translationX, limitX(scale.value));
        y.value = clamp(startY.value + event.translationY, limitY(scale.value));
      } else {
        drag.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (scale.value > 1) return;
      if (
        Math.abs(event.translationY) > DISMISS_DISTANCE ||
        Math.abs(event.velocityY) > DISMISS_VELOCITY
      ) {
        scheduleOnRN(onDismiss);
      } else {
        drag.value = withTiming(0);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1) {
        zoomTo(1, 0, 0);
        return;
      }
      // The point tapped stays under the finger as the picture grows.
      zoomTo(
        DOUBLE_TAP_SCALE,
        (width / 2 - event.x) * (DOUBLE_TAP_SCALE - 1),
        (height / 2 - event.y) * (DOUBLE_TAP_SCALE - 1)
      );
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(onTap);
  });

  const gestures = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap)
  );

  const moved = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value + drag.value },
      { scale: scale.value },
    ],
  }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(drag.value) / FADE_DISTANCE, 0.7),
  }));

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, backdrop]}>
        <View className="flex-1 bg-scrim" />
      </Animated.View>
      <GestureDetector gesture={gestures}>
        <View className="flex-1" collapsable={false}>
          <Animated.View style={[{ flex: 1 }, moved]}>
            <AppImage
              image={{ thumb: url, card: url, full: url, alt: label }}
              size="full"
              contentFit="contain"
              className="size-full bg-transparent"
              onLoad={onLoad}
              onError={onError}
            />
          </Animated.View>
        </View>
      </GestureDetector>
    </>
  );
}
