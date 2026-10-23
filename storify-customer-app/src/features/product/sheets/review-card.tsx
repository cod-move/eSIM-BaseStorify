import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { ImageViewer } from '@/components/ui/image-viewer';
import { Text } from '@/components/ui/text';
import type { ImageSet, Review } from '@/contracts/mobile/shop/v1';

/** Thumbnails a card shows; the rest open in the viewer. */
const THUMBS = 3;

/** A day the shopper reads at a glance: 12 Mar 2026. */
const DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;

const VERDICTS = [
  'verdictBad',
  'verdictPoor',
  'verdictAverage',
  'verdictGood',
  'verdictExcellent',
] as const;

/** Who answered the shopper: the seller the product page shows. */
export type ReplySeller = { name: string; logo?: ImageSet };

/** Five stars, as many filled as the review gave. */
function ReviewStars({ rating }: { rating: number }) {
  const t = useTranslations('reviews');
  return (
    <View accessible accessibilityLabel={t('starsLabel', { rating })} className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          size={14}
          filled
          colorClassName={star <= rating ? 'accent-rating' : 'accent-border'}
        />
      ))}
    </View>
  );
}

/** Up to three 60 pt thumbnails and a tile with the rest; each opens the viewer. */
function ReviewPhotos({ images }: { images: ImageSet[] }) {
  const t = useTranslations('reviews');
  const common = useTranslations('common');
  const [open, setOpen] = useState<number | null>(null);
  const more = images.length - THUMBS;
  const total = images.length;

  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        {images.slice(0, THUMBS).map((image, index) => (
          <Pressable
            key={index}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('openPhoto', { current: index + 1, total })}
            onPress={() => setOpen(index)}
            className="active:opacity-70">
            <AppImage image={image} size="thumb" className="size-15 rounded-sm" decorative />
          </Pressable>
        ))}
        {more > 0 ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t('openPhoto', { current: THUMBS + 1, total })}
            onPress={() => setOpen(THUMBS)}
            className="size-15 items-center justify-center rounded-sm bg-surface-alt active:opacity-70">
            <Text variant="label">{t('morePhotos', { count: more })}</Text>
          </Pressable>
        ) : null}
      </View>
      <ImageViewer
        images={images}
        initialIndex={open ?? 0}
        visible={open !== null}
        onClose={() => setOpen(null)}
        closeLabel={common('close')}
        positionLabel={(current, count) => t('photoOf', { current, total: count })}
      />
    </>
  );
}

/** The store's answer under a review, named after the seller, never after the reviewer. */
function ReplyCard({
  reply,
  seller,
}: {
  reply: NonNullable<Review['reply']>;
  seller: ReplySeller;
}) {
  const t = useTranslations('reviews');
  const format = useFormatter();

  return (
    <View className="ms-6 gap-2 rounded-xl bg-surface-alt p-4">
      <View className="flex-row items-center gap-2">
        <Icon name="messages" size={18} colorClassName="accent-muted" />
        <Text variant="label" className="flex-1">
          {t('responseFrom', { seller: seller.name })}
        </Text>
      </View>
      {reply.createdAt ? (
        <Text variant="caption">{format.dateTime(new Date(reply.createdAt), DATE)}</Text>
      ) : null}
      <Text variant="long" className="text-muted">
        {reply.comment}
      </Text>
      <View className="flex-row items-center gap-2 pt-1">
        {seller.logo ? (
          <View className="size-8 items-center justify-center overflow-hidden rounded-sm bg-surface">
            <AppImage
              image={seller.logo}
              size="thumb"
              contentFit="contain"
              className="size-7 bg-surface"
              decorative
            />
          </View>
        ) : null}
        <Text variant="label" numberOfLines={1} className="shrink">
          {seller.name}
        </Text>
      </View>
    </View>
  );
}

/** One review, with the store's reply under it when there is one. */
export function ReviewCard({ review, seller }: { review: Review; seller: ReplySeller }) {
  const t = useTranslations('reviews');
  const format = useFormatter();
  const verdict = VERDICTS[Math.min(Math.max(review.rating, 1), 5) - 1] ?? 'verdictAverage';

  return (
    <View className="gap-3">
      <View className="gap-3 rounded-xl bg-surface p-4">
        <View className="flex-row items-center gap-2">
          <ReviewStars rating={review.rating} />
          <Text variant="caption">{t(verdict)}</Text>
        </View>
        {review.title ? <Text variant="label">{review.title}</Text> : null}
        <Text variant="long" className="text-muted">
          {review.comment}
        </Text>
        {review.images.length > 0 ? <ReviewPhotos images={review.images} /> : null}
        <View className="flex-row items-center gap-1">
          <Text variant="caption" className="shrink">
            {t('posted', {
              when: format.dateTime(new Date(review.createdAt), DATE),
              name: review.author.name ?? t('anonymous'),
            })}
          </Text>
          {review.verifiedPurchase ? (
            <View accessible accessibilityLabel={t('verified')}>
              <Icon name="check-circle" size={14} colorClassName="accent-success" />
            </View>
          ) : null}
        </View>
      </View>
      {review.reply ? <ReplyCard reply={review.reply} seller={seller} /> : null}
    </View>
  );
}
