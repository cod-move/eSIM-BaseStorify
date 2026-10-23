import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { RadioRow } from '@/components/ui/rows';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { Review, ReviewSummary } from '@/contracts/mobile/shop/v1';

import { ReviewCard, type ReplySeller } from './review-card';

const STARS = [5, 4, 3, 2, 1] as const;

/** "Rating: All", and the sheet that chooses which star rating to show. */
function RatingFilter({
  summary,
  rating,
  onRating,
}: {
  summary: ReviewSummary;
  rating: number | undefined;
  onRating: (rating: number | undefined) => void;
}) {
  const t = useTranslations('reviews');
  const [open, setOpen] = useState(false);
  const choice = rating === undefined ? t('all') : t('stars', { stars: rating });
  const countOf = (stars: number) =>
    summary.distribution.find((row) => row.stars === stars)?.count ?? 0;
  const choose = (next: number | undefined) => {
    setOpen(false);
    onRating(next);
  };

  return (
    <View className="flex-row items-center gap-2">
      <Text variant="body" importantForAccessibility="no" accessibilityElementsHidden>
        {t('rating')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('filterLabel', { choice })}
        onPress={() => setOpen(true)}
        className="min-h-11 flex-row items-center gap-2 rounded-md border border-border bg-background px-3 active:opacity-70">
        <Text variant="body">{choice}</Text>
        <Icon name="chevron-down" size={14} colorClassName="accent-foreground" />
      </Pressable>
      <Sheet visible={open} title={t('filterTitle')} onClose={() => setOpen(false)}>
        <RadioRow
          title={t('all')}
          description={t('count', { count: summary.count })}
          selected={rating === undefined}
          onSelect={() => choose(undefined)}
        />
        {STARS.map((stars) => (
          <RadioRow
            key={stars}
            title={t('stars', { stars })}
            description={t('count', { count: countOf(stars) })}
            selected={rating === stars}
            onSelect={() => choose(stars)}
          />
        ))}
      </Sheet>
    </View>
  );
}

/** The top of the Reviews sheet: the average, the number of reviews and the rating filter. */
export function ReviewsSummary({
  summary,
  rating,
  onRating,
}: {
  summary: ReviewSummary;
  rating: number | undefined;
  onRating: (rating: number | undefined) => void;
}) {
  const t = useTranslations('reviews');
  const format = useFormatter();
  const average = format.number(summary.average, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });

  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3">
      <View
        accessible
        accessibilityLabel={t('averageLabel', { average, count: summary.count })}
        className="flex-row items-center gap-2">
        <Icon name="star" size={22} filled colorClassName="accent-rating" />
        <Text variant="price-large">{average}</Text>
        <Text variant="subheading" className="text-muted">
          {t('count', { count: summary.count })}
        </Text>
      </View>
      <RatingFilter summary={summary} rating={rating} onRating={onRating} />
    </View>
  );
}

/** The reviews, 12 pt apart, and the way to the next page. */
export function ReviewList({
  reviews,
  seller,
  hasMore,
  loadingMore,
  onMore,
}: {
  reviews: Review[];
  seller: ReplySeller;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const t = useTranslations('reviews');

  return (
    <View className="gap-3">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} seller={seller} />
      ))}
      {hasMore ? (
        <Button variant="secondary" label={t('showMore')} loading={loadingMore} onPress={onMore} />
      ) : null}
    </View>
  );
}
