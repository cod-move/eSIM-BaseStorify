import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import type { OrderLine } from '@/contracts/mobile/shop/v1';
import { useMeProduct } from '@/features/catalog/use-wishlist';

/**
 * "Write a review" under an order line, when the store says the shopper may
 * review that product (delivered to them, not reviewed on this order yet).
 */
export function LineReview({ line, onWrite }: { line: OrderLine; onWrite: () => void }) {
  const t = useTranslations('reviewWrite');
  const canReview = useMeProduct(line.productId).data?.canReview ?? false;

  if (!canReview) return null;
  return (
    <Button
      label={t('entry')}
      icon="star"
      variant="outline"
      size="sm"
      accessibilityLabel={t('entryFor', { name: line.name })}
      onPress={onWrite}
      className="self-end"
    />
  );
}
