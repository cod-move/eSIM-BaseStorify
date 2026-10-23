import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import type { Money } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { DiscountPill } from './badge';
import { Text } from './text';

const SIZES = {
  /** The mini cards of the home showcase panels, three across a phone. */
  sm: { price: 'price', className: 'text-[10px] leading-[14px]', compareAt: 'caption' },
  /** Cards and lines. */
  md: { price: 'price', className: undefined, compareAt: 'caption' },
  /** The grid card, two across a phone: the design's bold 17 pt price. */
  card: { price: 'price', className: 'text-[17px] leading-[22px]', compareAt: 'caption' },
  /** The product page, and totals. */
  lg: { price: 'price-large', className: undefined, compareAt: 'subheading' },
} as const;

type PriceProps = {
  /** Left out when there is no price to show, as for a product sold by quote. */
  price?: Money;
  /** The price before a discount, shown struck through. */
  compareAt?: Money;
  /** The lowest of several prices: "From …", left out beside a compare-at price. */
  from?: boolean;
  /** The product is sold by quote: "Price on request" in place of a price. */
  onRequest?: boolean;
  /** The store's words for the discount, in a pill after the compare-at price. */
  discountLabel?: string;
  size?: keyof typeof SIZES;
  className?: string;
};

/**
 * A price, exactly as the store formatted it. The app does not format money,
 * round it, or work out a discount: `formatted` is printed as it arrived, and
 * so is the store's discount label.
 *
 * A screen reader hears it as one phrase ("From $24.00, was $30.00"), because
 * a line through a number is not something it can say.
 */
export function Price({
  price,
  compareAt,
  from = false,
  onRequest = false,
  discountLabel,
  size = 'md',
  className,
}: PriceProps) {
  const t = useTranslations('catalog');
  const styles = SIZES[size];

  if (!price) {
    return onRequest ? (
      <Text variant={styles.price} className={cn('font-semibold text-muted', styles.className)}>
        {t('priceOnRequest')}
      </Text>
    ) : null;
  }

  const current = from && !compareAt ? t('from', { price: price.formatted }) : price.formatted;
  const spoken = [current];
  if (compareAt) spoken.push(t('compareAt', { price: compareAt.formatted }));
  if (discountLabel) spoken.push(discountLabel);

  return (
    <View
      accessible
      accessibilityLabel={spoken.join(t('separator'))}
      className={cn('flex-row flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <Text variant={styles.price} className={styles.className}>
        {current}
      </Text>
      {compareAt ? (
        <Text
          variant={styles.compareAt}
          className={cn('text-muted line-through', size === 'sm' && styles.className)}>
          {compareAt.formatted}
        </Text>
      ) : null}
      {discountLabel ? (
        <DiscountPill label={discountLabel} size={size === 'lg' ? 'md' : 'sm'} />
      ) : null}
    </View>
  );
}
