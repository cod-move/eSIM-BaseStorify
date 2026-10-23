import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import type { Rating } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { Icon } from './icon';
import { Text } from './text';

const STARS = 5;

/**
 * How full each of the five stars is, from 0 to 1, in quarter steps: 4.3 is
 * four full stars and a quarter of the fifth.
 */
export function starFills(average: number): number[] {
  // A rating that is not a number draws five empty stars, never a broken row.
  const clamped = Number.isFinite(average) ? Math.min(Math.max(average, 0), STARS) : 0;
  const quarters = Math.round(clamped * 4);
  return Array.from(
    { length: STARS },
    (_, index) => Math.min(Math.max(quarters - index * 4, 0), 4) / 4
  );
}

/** The words a screen reader says for a rating: "4.5 out of 5, 350 reviews, 3 sold". */
function useRatingLabel() {
  const t = useTranslations('catalog');
  const format = useFormatter();

  return {
    average: (value: number) =>
      format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    label: (rating: Rating, soldCount?: number) => {
      const parts = [
        t('ratingLabel', {
          average: format.number(rating.average, { maximumFractionDigits: 1 }),
          count: rating.count,
        }),
      ];
      if (soldCount !== undefined) parts.push(t('sold', { count: soldCount }));
      return parts.join(t('separator'));
    },
  };
}

type CompactRatingProps = {
  rating: Rating;
  /** The average beside the star ("4.5"). Off on the seller tile, which shows the count. */
  showAverage?: boolean;
  /** The number of reviews, "(350)". */
  showCount?: boolean;
  /** Units sold, after a thin line: "| 3 sold". */
  soldCount?: number;
  /** `sm` for the mini cards of the home showcase panels. */
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * The rating on cards and rows: one full star and the average.
 * A single star is always drawn full: a part-filled star alone
 * reads as broken, and the number carries the rating. A product without a
 * rating shows nothing, which is the caller's `rating && …`.
 */
export function CompactRating({
  rating,
  showAverage = true,
  showCount = false,
  soldCount,
  size = 'md',
  className,
}: CompactRatingProps) {
  const t = useTranslations('catalog');
  const words = useRatingLabel();
  const small = size === 'sm';
  const text = cn('font-semibold', small && 'text-[10px] leading-[13px]');

  return (
    <View
      accessible
      accessibilityLabel={words.label(rating, soldCount)}
      className={cn('flex-row items-center gap-1', className)}>
      <Icon name="star" size={small ? 11 : 14} colorClassName="accent-rating" filled />
      {showAverage ? (
        <Text variant="caption" className={text}>
          {words.average(rating.average)}
        </Text>
      ) : null}
      {showCount ? (
        <Text variant="caption" className={cn(small && text)}>
          {t('reviewCount', { count: rating.count })}
        </Text>
      ) : null}
      {soldCount !== undefined ? (
        <>
          <View className="mx-0.5 h-3 w-px bg-border" />
          <Text variant="caption" className={cn(small && text)}>
            {t('sold', { count: soldCount })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

type StarRatingProps = {
  rating: Rating;
  /** Units sold, after a thin line: "| 3 sold". */
  soldCount?: number;
  /** The size of each star, in points. */
  starSize?: number;
  className?: string;
};

/**
 * The full rating of the product page and the reviews: five stars filled to
 * the average in quarter steps, the number of reviews, and "N sold". A partly
 * filled star fills from the reading edge, so it fills from the right in
 * Arabic.
 */
export function StarRating({ rating, soldCount, starSize = 16, className }: StarRatingProps) {
  const t = useTranslations('catalog');
  const words = useRatingLabel();

  return (
    <View
      accessible
      accessibilityLabel={words.label(rating, soldCount)}
      className={cn('flex-row flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <View className="flex-row gap-0.5">
        {starFills(rating.average).map((fill, index) => (
          <PartStar key={index} fill={fill} size={starSize} />
        ))}
      </View>
      <Text variant="caption">{t('reviewCount', { count: rating.count })}</Text>
      {soldCount !== undefined ? (
        <>
          <View className="h-3 w-px bg-border" />
          <Text variant="caption">{t('sold', { count: soldCount })}</Text>
        </>
      ) : null}
    </View>
  );
}

/** One star: the outline, with the filled star over it, cut at `fill` from the start. */
function PartStar({ fill, size }: { fill: number; size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Icon name="star" size={size} colorClassName="accent-rating" />
      {fill > 0 ? (
        <View
          className="absolute start-0 top-0 overflow-hidden"
          style={{ width: size * fill, height: size }}>
          <Icon name="star" size={size} colorClassName="accent-rating" filled />
        </View>
      ) : null}
    </View>
  );
}
