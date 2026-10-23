import { useId, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppImage } from '@/components/ui/app-image';
import { Price } from '@/components/ui/price';
import { Text } from '@/components/ui/text';
import type {
  Alignment,
  HomeCta,
  HomePaint,
  MediaFrame,
  MediaRow,
  Slide as SlideData,
} from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';
import { cn } from '@/lib/cn';

/** A frame the store sent without a shape, alone in its row. */
const FALLBACK_RATIO = 16 / 9;

type SlideContent = Omit<SlideData, 'id'>;

type SlideProps = {
  slide: SlideContent;
  /** Where the slide and its buttons lead when they carry no link of their own: the row's or the block's. */
  fallbackHref?: string;
  className?: string;
};

/**
 * One slide, from the back: its paint (colour or gradient), its picture, the
 * darkening, then the artwork and the copy where `align` puts them. The text
 * is the store's, drawn by the app, never baked into the picture. The parent
 * gives the slide its size.
 */
export function Slide({ slide, fallbackHref, className }: SlideProps) {
  const openLink = useOpenLink();
  const href = slide.href ?? fallbackHref;
  const buttons = [slide.cta, slide.secondaryCta].flatMap((cta) => {
    const target = cta?.href ?? href;
    return cta && target ? [{ ...cta, href: target }] : [];
  });
  const label = slide.heading ?? slide.image?.alt ?? slide.artwork?.alt;

  return (
    <Pressable
      // With buttons of its own, the slide steps aside so a screen reader reaches them.
      accessible={Boolean(href) && buttons.length === 0}
      accessibilityRole={href ? 'link' : undefined}
      accessibilityLabel={label}
      disabled={!href}
      onPress={() => href && openLink(href)}
      className={cn('overflow-hidden rounded-xl bg-surface active:opacity-90', className)}>
      {slide.background ? <Paint paint={slide.background} /> : null}
      {slide.image ? (
        <AppImage
          image={slide.image}
          size="full"
          // Cropped to the frame, never stretched: the frame on a phone is not the one the picture was made for.
          contentFit="cover"
          className="absolute inset-0 bg-transparent"
          decorative
        />
      ) : null}
      {slide.background?.overlay ? (
        <View className="absolute inset-0 bg-scrim" style={{ opacity: slide.background.overlay }} />
      ) : null}
      <SlideBody slide={slide} buttons={buttons} />
    </Pressable>
  );
}

const JUSTIFY: Record<Alignment, string> = {
  START: 'justify-start',
  CENTER: 'justify-center',
  END: 'justify-end',
};
const ITEMS: Record<Alignment, string> = {
  START: 'items-start',
  CENTER: 'items-center',
  END: 'items-end',
};

/**
 * How large a slide's copy and artwork are, from the slide's width: the hero,
 * a half-width banner of a grid, or a small tile.
 */
type SlideSize = 'hero' | 'banner' | 'tile';
const HERO_WIDTH = 260;
const BANNER_WIDTH = 150;

const HEADING: Record<SlideSize, 'title-large' | 'heading'> = {
  hero: 'title-large',
  banner: 'title-large',
  tile: 'heading',
};

/**
 * The artwork is a layer of its own behind the copy, as on the website: free to
 * sit under the heading's edge. With the copy centred it fills the far end of
 * the slide; beside copy at one side, it takes the other side and the foot.
 */
function Artwork({
  slide,
  centred,
  vertical,
}: {
  slide: SlideContent;
  centred: boolean;
  vertical: Alignment;
}) {
  if (!slide.artwork) return null;
  const box = centred
    ? cn(
        'absolute inset-x-0 items-center',
        vertical === 'END' ? 'top-0 h-2/5 justify-start pt-3' : 'bottom-0 h-2/5 justify-end'
      )
    : cn(
        'absolute bottom-0 h-[76%] w-[58%] items-center justify-end',
        slide.align?.horizontal === 'END' ? 'start-0' : 'end-0'
      );
  return (
    <View className={box} pointerEvents="none">
      <AppImage
        image={slide.artwork}
        size="card"
        contentFit="contain"
        className={cn('bg-transparent', centred ? 'h-full w-[90%]' : 'size-full')}
        decorative
      />
    </View>
  );
}

/**
 * A slide's button, drawn as the store's slider draws its default ("dark"): a
 * near-black plate with light text and soft corners, the same in both themes,
 * since the slide is. The second button is the "light" plate. The API does
 * not send a slide's own button style yet, so every slide takes these.
 */
function SlideButton({
  label,
  href,
  second,
  size,
  onPicture,
}: {
  label: string;
  href?: string;
  second?: boolean;
  size: SlideSize;
  /** On a photograph rather than a painted slide: the light ring, as the store's slides on a photo use. */
  onPicture?: boolean;
}) {
  const openLink = useOpenLink();
  const plate = cn(
    'items-center justify-center rounded-lg',
    size === 'hero' ? 'min-h-10 px-5' : 'min-h-8 px-3',
    onPicture
      ? 'border-[1.5px] border-on-scrim bg-transparent'
      : second
        ? 'bg-on-scrim'
        : 'bg-scrim/90'
  );
  const text = (
    <Text
      variant={size === 'hero' ? 'label' : 'chip'}
      className={second && !onPicture ? 'text-scrim' : 'text-on-scrim'}
      numberOfLines={1}>
      {label}
    </Text>
  );
  return href ? (
    <Pressable
      accessibilityRole="link"
      onPress={() => openLink(href)}
      hitSlop={size === 'hero' ? undefined : 6}
      className={cn(plate, 'active:opacity-80')}>
      {text}
    </Pressable>
  ) : (
    // A button the store set without a link, on a slide without one, still shows, as in its design.
    <View className={plate}>{text}</View>
  );
}

function SlideBody({ slide, buttons }: { slide: SlideContent; buttons: Required<HomeCta>[] }) {
  const [width, setWidth] = useState(0);
  const horizontal = slide.align?.horizontal ?? 'START';
  const vertical = slide.align?.vertical ?? 'CENTER';
  const centred = horizontal === 'CENTER';
  const size: SlideSize = width >= HERO_WIDTH ? 'hero' : width >= BANNER_WIDTH ? 'banner' : 'tile';
  const color = slide.textColor ? { color: slide.textColor } : undefined;
  // The store paints its slides the same in both themes, so copy without a colour of its own
  // takes dark ink (`scrim`) rather than the theme's, which turns light in dark mode.
  const ink = !slide.textColor && (slide.background || slide.image) ? 'text-scrim' : undefined;
  const textClass = cn(centred && 'text-center', ink);
  const shown: { label: string; href?: string }[] =
    buttons.length > 0 ? buttons : slide.cta?.label ? [{ label: slide.cta.label }] : [];
  // The description is left out: the heading and button carry the slide.
  const hasCopy = Boolean(slide.tagline || slide.heading || slide.price || shown.length > 0);

  if (!hasCopy && !slide.artwork) return null;

  return (
    <View
      className="absolute inset-0"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Artwork slide={slide} centred={centred} vertical={vertical} />
      {hasCopy ? (
        <View
          className={cn(
            'absolute inset-0 gap-3',
            size === 'tile' ? 'gap-2 p-3' : 'px-5 py-4',
            ITEMS[horizontal],
            // Beside the artwork on a banner, the heading keeps the top and the button the foot, clear of the art.
            size !== 'hero' && !centred && slide.artwork ? 'justify-between' : JUSTIFY[vertical]
          )}>
          {slide.tagline ? (
            <Text variant="caption" className={textClass} style={color}>
              {slide.tagline}
            </Text>
          ) : null}
          {slide.heading ? (
            <Text
              variant={HEADING[size]}
              // Beside the artwork, the heading keeps to its own side; a button may reach over the art.
              className={cn(
                textClass,
                size === 'hero' && 'font-medium',
                !centred && slide.artwork && 'max-w-[70%]'
              )}
              style={color}>
              {slide.heading}
            </Text>
          ) : null}
          {slide.price ? <Price price={slide.price} compareAt={slide.compareAtPrice} /> : null}
          {shown.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {shown.map((button, index) => (
                <SlideButton
                  key={`${index}-${button.label}`}
                  label={button.label}
                  href={button.href}
                  second={index > 0}
                  size={size}
                  onPicture={Boolean(slide.image) && !slide.background}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The colour or gradient behind a slide. Gradients follow CSS: the angle points up at 0 degrees. */
export function Paint({ paint }: { paint: HomePaint }) {
  const id = `paint${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { gradient, color } = paint;

  if (gradient && gradient.stops.length > 0) {
    const radians = (gradient.angle * Math.PI) / 180;
    const dx = Math.sin(radians) / 2;
    const dy = -Math.cos(radians) / 2;
    const stops = gradient.stops.map((stop, index) => (
      <Stop key={index} offset={`${stop.at}%`} stopColor={stop.color} />
    ));

    return (
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {gradient.kind === 'RADIAL' ? (
            <RadialGradient id={id} cx="50%" cy="50%" r="71%">
              {stops}
            </RadialGradient>
          ) : (
            <LinearGradient id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
              {stops}
            </LinearGradient>
          )}
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    );
  }

  return color ? <View className="absolute inset-0" style={{ backgroundColor: color }} /> : null;
}

type CarouselProps = {
  slides: SlideData[];
  fallbackHref?: string;
  className?: string;
};

/**
 * A frame of slides. One slide fills the frame; more slide sideways with a
 * page indicator. A frame with no slides is a quiet plate, so the grid it
 * sits in keeps its shape.
 */
function Carousel({ slides, fallbackHref, className }: CarouselProps) {
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);

  if (slides.length <= 1) {
    const [slide] = slides;
    return slide ? (
      <Slide slide={slide} fallbackHref={fallbackHref} className={className} />
    ) : (
      <View className={cn('rounded-xl bg-surface', className)} />
    );
  }

  const onScroll = (step: number) => (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / step);
    if (step > 0 && next !== page) setPage(Math.max(0, Math.min(slides.length - 1, next)));
  };

  // In a grid the frame keeps the shape its parent gives it, so the dots sit on the slides.
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMeasured({ width, height });
  };

  return (
    <View onLayout={onLayout} className={cn('overflow-hidden rounded-xl', className)}>
      {measured.width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll(measured.width)}
          scrollEventThrottle={32}>
          {slides.map((slide) => (
            <View key={slide.id} style={measured}>
              <Slide slide={slide} fallbackHref={fallbackHref} className="flex-1" />
            </View>
          ))}
        </ScrollView>
      ) : null}
      <PageDots count={slides.length} page={page} className="absolute bottom-2" />
    </View>
  );
}

/** A pill track with a long dot for the slide in view. Screen readers count slides themselves. */
function PageDots({ count, page, className }: { count: number; page: number; className?: string }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(
        'flex-row items-center gap-1 self-center rounded-full bg-surface px-2 py-1.5',
        className
      )}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          className={cn(
            'h-1.5 rounded-full',
            index === page ? 'w-6 bg-primary' : 'w-1.5 bg-border'
          )}
        />
      ))}
    </View>
  );
}

type MediaRowsProps = {
  rows: MediaRow[];
  fallbackHref?: string;
};

/**
 * A grid of frames as the web lays it out on a phone: one column runs the
 * full width, two share it, and each column stacks its frames.
 */
export function MediaRows({ rows, fallbackHref }: MediaRowsProps) {
  return (
    <View className="gap-3">
      {rows.map((row, rowIndex) => {
        const shared = row.columns.length > 1;
        return (
          <View key={rowIndex} className="flex-row gap-3 px-4">
            {row.columns.map((column, columnIndex) => (
              <View key={columnIndex} className="flex-1 gap-3">
                {column.map((frame) => (
                  <Frame key={frame.id} frame={frame} shared={shared} fallbackHref={fallbackHref} />
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Frame({
  frame,
  shared,
  fallbackHref,
}: {
  frame: MediaFrame;
  shared: boolean;
  fallbackHref?: string;
}) {
  // A frame without a shape is as tall as the column beside it; alone in its row it has none to follow.
  const aspectRatio = frame.aspectRatio ?? (shared ? undefined : FALLBACK_RATIO);

  return (
    <View
      className={cn(!aspectRatio && 'min-h-24 flex-1')}
      style={aspectRatio ? { aspectRatio } : undefined}>
      <Carousel slides={frame.slides} fallbackHref={fallbackHref} className="flex-1" />
    </View>
  );
}
