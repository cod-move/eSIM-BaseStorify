import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { ImageViewer } from '@/components/ui/image-viewer';
import { Text } from '@/components/ui/text';
import type { ImageSet } from '@/contracts/mobile/shop/v1';

const GUTTER = 16;
const GAP = 12;
/** How much of the next card shows, so the shopper sees there is more. */
const PEEK = 28;

/**
 * The gallery: one card per picture, swiping sideways with the next
 * card peeking, and the page indicator inside the card. A tap opens the
 * picture over the whole screen.
 *
 * `focus` is the picture of what the shopper picked (a colour): the gallery
 * slides to it. One that is not among the product's pictures leads them.
 */
export function ProductGallery({ images: own, focus }: { images: ImageSet[]; focus?: ImageSet }) {
  const t = useTranslations('product');
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<ImageSet>>(null);
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);

  const images = focus && !own.some((image) => image.full === focus.full) ? [focus, ...own] : own;
  const single = images.length <= 1;
  const cardWidth = single ? width - GUTTER * 2 : width - GUTTER * 2 - PEEK;
  const step = cardWidth + GAP;

  // A new pick moves the indicator at once (set while rendering, as React allows) and the cards after it.
  const target = focus ? images.findIndex((image) => image.full === focus.full) : -1;
  const [followed, setFollowed] = useState(focus?.full);
  if (focus?.full !== followed) {
    setFollowed(focus?.full);
    if (target >= 0) setIndex(target);
  }
  useEffect(() => {
    if (target >= 0) list.current?.scrollToOffset({ offset: target * step, animated: true });
  }, [followed, target, step]);

  if (images.length === 0) {
    return (
      <View className="mx-4 aspect-square rounded-2xl bg-surface">
        <AppImage image={undefined} size="full" className="size-full" decorative />
      </View>
    );
  }

  return (
    <View>
      <FlatList
        ref={list}
        horizontal
        data={images}
        keyExtractor={(image, position) => `${position}-${image.full}`}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEnabled={!single}
        contentContainerClassName="px-4 gap-3"
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / step))
        }
        renderItem={({ item, index: position }) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t('openPicture', {
              current: position + 1,
              total: images.length,
            })}
            onPress={() => setViewing(position)}
            style={{ width: cardWidth }}
            className="aspect-square overflow-hidden rounded-2xl bg-surface active:opacity-90">
            <AppImage image={item} size="full" contentFit="contain" className="size-full" />
            {single ? null : (
              <View className="absolute bottom-3 end-3 rounded-full bg-scrim px-2.5 py-1">
                <Text variant="caption" className="text-primary-foreground">
                  {t('pictureOf', { current: index + 1, total: images.length })}
                </Text>
              </View>
            )}
          </Pressable>
        )}
      />
      <ImageViewer
        images={images}
        initialIndex={viewing ?? 0}
        visible={viewing !== null}
        onClose={() => setViewing(null)}
        closeLabel={t('closePicture')}
        positionLabel={(current, total) => t('pictureOf', { current, total })}
      />
    </View>
  );
}
