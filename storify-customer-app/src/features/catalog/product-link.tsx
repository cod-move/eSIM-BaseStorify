import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { useOpenProduct, type ProductRef } from './use-open-product';

type ProductLinkProps = {
  /** The line's product: its name is what a screen reader says. */
  product: ProductRef;
  /** What the product's picture or name sits in. The controls of a row stay outside it, as siblings. */
  children: ReactNode;
  className?: string;
  /**
   * A second way into the same page beside a link that already names it (a
   * row's picture next to its name): it takes taps, and a screen reader skips it.
   */
  duplicate?: boolean;
};

/**
 * A product shown as a line (a cart line, an order's, a return's) opens that
 * product's page when tapped: a link named by the product. A line's own
 * controls (the stepper, "Write a review") are not inside it, so a tap on one
 * never opens the page.
 */
export function ProductLink({ product, children, className, duplicate = false }: ProductLinkProps) {
  const t = useTranslations('common');
  const open = useOpenProduct();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={product.name}
      accessibilityHint={t('openProduct')}
      accessible={!duplicate}
      importantForAccessibility={duplicate ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={duplicate}
      onPress={() => open(product)}
      className={cn('active:opacity-70', className)}>
      {children}
    </Pressable>
  );
}
