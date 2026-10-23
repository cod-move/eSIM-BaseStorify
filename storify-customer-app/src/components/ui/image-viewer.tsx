import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslations } from 'use-intl';

import type { ImageSet } from '@/contracts/mobile/shop/v1';

import { AppImage } from './app-image';
import { Icon } from './icon';
import { Text } from './text';

/** How far a picture can be pinched up. */
const MAX_ZOOM = 4;
/** Where a double tap zooms to. */
const DOUBLE_TAP_ZOOM = 2.5;
/** A picture is the one shown once most of it is on screen. */
const VIEWABILITY = { itemVisiblePercentThreshold: 60 } as const;
/** A downward drag longer than this (pt), or faster than the speed (pt/s), closes the viewer. */
const DISMISS_DISTANCE = 120;
const DISMISS_SPEED = 1000;
/** How far a finger moves before the picture decides it is a drag and not a tap or a swipe. */
const SLOP = 10;
/** The drag distance at which the backdrop has faded most of the way, and the chrome has gone. */
const BACKDROP_FADE = 320;
const CHROME_FADE = 100;
const ZOOM_MS = 220;

type PageProps = {
  image: ImageSet;
  width: number;
  height: number;
  /** The vertical drag of the picture on show, shared so the backdrop can follow it. */
  dragY: SharedValue<number>;
  /** The picture is zoomed in (the row of pictures stops swiping) or back as fitted. */
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
};

/**
 * One picture, fitted to the screen, with the gestures of every photo viewer:
 * pinch to zoom, double tap to zoom in and back, drag to move a zoomed picture,
 * and a drag down (or up) on a picture as fitted to close the viewer. A sideways
 * swipe on a picture as fitted is left to the row.
 */
function Page({ image, width, height, dragY, onZoomChange, onDismiss }: PageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 1), MAX_ZOOM);
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withTiming(1, { duration: ZOOM_MS });
        x.value = withTiming(0, { duration: ZOOM_MS });
        y.value = withTiming(0, { duration: ZOOM_MS });
      }
      scheduleOnRN(onZoomChange, scale.value > 1.02);
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (touch) {
        startX.value = touch.absoluteX;
        startY.value = touch.absoluteY;
      }
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      if (scale.value > 1) {
        manager.activate();
        return;
      }
      // As fitted: two fingers are a pinch; a vertical drag closes; a sideways one is the row's.
      const dx = Math.abs(touch.absoluteX - startX.value);
      const dy = Math.abs(touch.absoluteY - startY.value);
      if (event.numberOfTouches > 1) manager.fail();
      else if (dy > SLOP && dy > dx) manager.activate();
      else if (dx > SLOP) manager.fail();
    })
    .onStart(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    })
    .onUpdate((event) => {
      if (scale.value > 1) {
        const limitX = (width * (scale.value - 1)) / 2;
        const limitY = (height * (scale.value - 1)) / 2;
        x.value = Math.min(Math.max(savedX.value + event.translationX, -limitX), limitX);
        y.value = Math.min(Math.max(savedY.value + event.translationY, -limitY), limitY);
      } else {
        dragY.set(event.translationY);
      }
    })
    .onEnd((event) => {
      if (scale.value > 1) return;
      if (
        Math.abs(event.translationY) > DISMISS_DISTANCE ||
        Math.abs(event.velocityY) > DISMISS_SPEED
      ) {
        scheduleOnRN(onDismiss);
      } else {
        dragY.set(withTiming(0, { duration: ZOOM_MS }));
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event, success) => {
      if (!success) return;
      if (scale.value > 1) {
        scale.value = withTiming(1, { duration: ZOOM_MS });
        x.value = withTiming(0, { duration: ZOOM_MS });
        y.value = withTiming(0, { duration: ZOOM_MS });
        scheduleOnRN(onZoomChange, false);
      } else {
        // Zoom toward the point tapped, as far as the picture's edges allow.
        const limitX = (width * (DOUBLE_TAP_ZOOM - 1)) / 2;
        const limitY = (height * (DOUBLE_TAP_ZOOM - 1)) / 2;
        const toX = (width / 2 - event.x) * (DOUBLE_TAP_ZOOM - 1);
        const toY = (height / 2 - event.y) * (DOUBLE_TAP_ZOOM - 1);
        scale.value = withTiming(DOUBLE_TAP_ZOOM, { duration: ZOOM_MS });
        x.value = withTiming(Math.min(Math.max(toX, -limitX), limitX), { duration: ZOOM_MS });
        y.value = withTiming(Math.min(Math.max(toY, -limitY), limitY), { duration: ZOOM_MS });
        scheduleOnRN(onZoomChange, true);
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const moved = useAnimatedStyle(() => ({
    transform: [
      { translateY: dragY.value },
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View testID="image-viewer-zoom" style={[{ width, height }, moved]}>
        <AppImage
          image={image}
          size="full"
          contentFit="contain"
          className="size-full bg-transparent"
        />
      </Animated.View>
    </GestureDetector>
  );
}

type Labels = {
  /** What a screen reader says for the close button. Defaults to the shared message. */
  closeLabel?: string;
  /** Where the picture on show is in the row, for a screen reader. Defaults to the shared message. */
  positionLabel?: (current: number, total: number) => string;
};

type PagerProps = Labels & { images: ImageSet[]; initialIndex: number; onClose: () => void };

function Pager({ images, initialIndex, onClose, closeLabel, positionLabel }: PagerProps) {
  const t = useTranslations('common');
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const dragY = useSharedValue(0);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const shown = viewableItems[0]?.index;
      if (typeof shown === 'number') setCurrent(shown);
    },
    []
  );

  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dragY.value), [0, BACKDROP_FADE], [1, 0.25], 'clamp'),
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dragY.value), [0, CHROME_FADE], [1, 0], 'clamp'),
  }));

  const position = positionLabel
    ? positionLabel(current + 1, images.length)
    : t('positionLabel', { current: current + 1, total: images.length });

  return (
    <GestureHandlerRootView className="flex-1" testID="image-viewer-page" accessibilityViewIsModal>
      {/* Black behind the status bar in both themes, so its text must be light. */}
      <StatusBar style="light" />
      <Animated.View
        pointerEvents="none"
        className="bg-scrim"
        style={[StyleSheet.absoluteFill, backdrop]}
      />
      <FlatList
        testID="image-viewer-row"
        // A turned phone has pages of another width: start again at the picture on show.
        key={width}
        data={images}
        keyExtractor={(image, index) => `${index}:${image.full}`}
        renderItem={({ item }) => (
          <Page
            image={item}
            width={width}
            height={height}
            dragY={dragY}
            onZoomChange={setZoomed}
            onDismiss={onClose}
          />
        )}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={current}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        windowSize={3}
        viewabilityConfig={VIEWABILITY}
        onViewableItemsChanged={onViewableItemsChanged}
      />

      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, chrome]}>
        <View className="absolute end-3" style={{ top: insets.top + 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel ?? t('closeLabel')}
            onPress={onClose}
            className="size-11 items-center justify-center rounded-full bg-on-scrim/20 active:opacity-70">
            <Icon name="close" size={22} colorClassName="accent-on-scrim" />
          </Pressable>
        </View>

        {images.length > 1 ? (
          <View
            className="absolute inset-x-0 items-center"
            style={{ bottom: insets.bottom + 16 }}
            pointerEvents="none">
            <View
              className="rounded-full bg-on-scrim/20 px-3 py-1.5"
              accessible
              accessibilityLabel={position}
              accessibilityLiveRegion="polite">
              <Text variant="caption" className="text-on-scrim">
                {t('positionCount', { current: current + 1, total: images.length })}
              </Text>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </GestureHandlerRootView>
  );
}

type ImageViewerProps = Labels & {
  /** The pictures to page through. Nothing opens without one. */
  images: ImageSet[];
  /** The one shown first. */
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
};

/**
 * A picture, or a row of them, over the whole screen: black in both themes, the
 * picture fitted, a swipe to the next, a pinch or a double tap to zoom, a drag
 * down to close, the page count and a close button (the Android back button
 * closes it too). The sentences it says are the shared `common` messages; a
 * caller with better words for its pictures passes its own.
 */
export function ImageViewer({
  images,
  initialIndex = 0,
  visible,
  onClose,
  closeLabel,
  positionLabel,
}: ImageViewerProps) {
  if (images.length === 0) return null;

  return (
    <Modal
      testID="image-viewer"
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pager
        images={images}
        initialIndex={Math.min(Math.max(initialIndex, 0), images.length - 1)}
        onClose={onClose}
        closeLabel={closeLabel}
        positionLabel={positionLabel}
      />
    </Modal>
  );
}
