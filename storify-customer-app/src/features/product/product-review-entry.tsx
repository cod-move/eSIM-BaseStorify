import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { useMeProduct } from '@/features/catalog/use-wishlist';

import { useProduct } from './use-product';

/**
 * The way to write a review of the product, on its page and at the top of its
 * Reviews sheet, to `/products/[slug]/write-review`. It shows only when the
 * store says the shopper may review it (`canReview`), which needs them signed in.
 */
export function ProductReviewEntry({
  slug,
  className = 'mb-4',
}: {
  slug: string;
  className?: string;
}) {
  const t = useTranslations('reviewWrite');
  const router = useRouter();
  const canReview = useMeProduct(useProduct(slug).data?.id).data?.canReview ?? false;

  if (!canReview) return null;
  return (
    <Button
      label={t('entry')}
      icon="star"
      variant="outline"
      className={className}
      onPress={() => router.push({ pathname: '/products/[slug]/write-review', params: { slug } })}
    />
  );
}
