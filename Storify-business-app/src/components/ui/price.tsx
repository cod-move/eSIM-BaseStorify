import type { Money } from '@/contracts/mobile/biz/v1';

import { Text, type TextProps } from './text';

type PriceProps = Omit<TextProps, 'variant' | 'children'> & {
  money: Money;
  /** `price` in a row, `price-large` on a page, `metric` on a tile. */
  variant?: 'price' | 'price-large' | 'metric' | 'metric-large';
};

/**
 * Money, exactly as the store formatted it for its currency and language. The
 * app never formats, rounds or adds up money (ESLint refuses `style:
 * 'currency'`); this is the one way an amount reaches the screen.
 */
export function Price({ money, variant = 'price', ...props }: PriceProps) {
  return (
    <Text variant={variant} numberOfLines={1} {...props}>
      {money.formatted}
    </Text>
  );
}
