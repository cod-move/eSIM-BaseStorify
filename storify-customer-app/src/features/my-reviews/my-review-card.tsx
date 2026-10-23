import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ImageViewer } from '@/components/ui/image-viewer';
import { Text } from '@/components/ui/text';
import type { MyReview, ReviewPhoto } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

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

/** How a status looks; the store's words always say it. Another status is neutral. */
const STATUS_TONES: Record<string, { box: string; label: string }> = {
  PUBLISHED: { box: 'border-success', label: 'text-success' },
  PENDING: { box: 'border-accent', label: 'text-accent' },
  REJECTED: { box: 'border-danger', label: 'text-danger' },
};
const NEUTRAL = { box: 'border-border', label: 'text-muted' };

function StatusPill({ status, message }: { status: string; message: string }) {
  const tone = STATUS_TONES[status] ?? NEUTRAL;
  return (
    <View className={cn('self-start rounded-full border px-3 py-1', tone.box)}>
      <Text variant="caption" className={cn('font-semibold', tone.label)} numberOfLines={1}>
        {message}
      </Text>
    </View>
  );
}

function Stars({ rating }: { rating: number }) {
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

function Photos({ photos }: { photos: ReviewPhoto[] }) {
  const t = useTranslations('reviews');
  const common = useTranslations('common');
  const [open, setOpen] = useState<number | null>(null);
  const images = photos.map((photo) => photo.image);
  const total = images.length;
  const more = total - THUMBS;

  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        {images.slice(0, THUMBS).map((image, index) => (
          <Pressable
            key={photos[index]?.id ?? index}
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

type MyReviewCardProps = {
  review: MyReview;
  /** Left out when the store says the review cannot be changed. */
  onEdit?: () => void;
};

/**
 * One of the shopper's reviews: the product with Edit at the top end when the
 * store allows it, where the review stands in the store's words, the review,
 * and the store's reply under it.
 */
export function MyReviewCard({ review, onEdit }: MyReviewCardProps) {
  const t = useTranslations('myReviews');
  const reviews = useTranslations('reviews');
  const format = useFormatter();
  const router = useRouter();
  const verdict = VERDICTS[Math.min(Math.max(review.rating, 1), 5) - 1] ?? 'verdictAverage';
  const { product } = review;
  const slug = product.slug;

  return (
    <View className="gap-3">
      <View className="gap-3 rounded-xl bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole={slug ? 'link' : undefined}
            accessibilityLabel={product.name}
            disabled={!slug}
            onPress={() => {
              if (slug) router.push({ pathname: '/products/[slug]', params: { slug } });
            }}
            className="min-h-11 flex-1 flex-row items-center gap-3 active:opacity-80">
            <AppImage
              image={product.image}
              size="thumb"
              className="size-14 rounded-md"
              decorative
            />
            <Text variant="label" className="flex-1" numberOfLines={2}>
              {product.name}
            </Text>
          </Pressable>
          {onEdit ? (
            <Button
              label={t('edit')}
              size="sm"
              accessibilityLabel={t('editLabel', { name: product.name })}
              onPress={onEdit}
            />
          ) : null}
        </View>
        <StatusPill status={review.status} message={review.statusMessage} />
        <View className="flex-row items-center gap-2">
          <Stars rating={review.rating} />
          <Text variant="caption">{reviews(verdict)}</Text>
        </View>
        {review.title ? <Text variant="label">{review.title}</Text> : null}
        <Text variant="long" className="text-muted">
          {review.text}
        </Text>
        {review.photos.length > 0 ? <Photos photos={review.photos} /> : null}
        <View className="flex-row items-center gap-1">
          <Text variant="caption" className="shrink">
            {t('posted', { when: format.dateTime(new Date(review.createdAt), DATE) })}
            {review.editedAt
              ? ` · ${t('edited', { when: format.dateTime(new Date(review.editedAt), DATE) })}`
              : ''}
          </Text>
          {review.verifiedPurchase ? (
            <View accessible accessibilityLabel={reviews('verified')}>
              <Icon name="check-circle" size={14} colorClassName="accent-success" />
            </View>
          ) : null}
        </View>
      </View>
      {review.reply ? (
        <View className="ms-6 gap-2 rounded-xl bg-surface-alt p-4">
          <View className="flex-row items-center gap-2">
            <Icon name="messages" size={18} colorClassName="accent-muted" />
            <Text variant="label" className="flex-1">
              {t('reply')}
            </Text>
          </View>
          {review.reply.createdAt ? (
            <Text variant="caption">{format.dateTime(new Date(review.reply.createdAt), DATE)}</Text>
          ) : null}
          <Text variant="long" className="text-muted">
            {review.reply.comment}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
