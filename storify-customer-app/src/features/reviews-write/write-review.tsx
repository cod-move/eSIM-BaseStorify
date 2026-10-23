import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { SuccessState } from '@/components/ui/state-view';
import type { ImageSet, ReviewLimits } from '@/contracts/mobile/shop/v1';

import { ReviewForm } from './review-form';
import { useWriteReview } from './use-write-review';

type WriteReviewProps = {
  product: { id: string; slug: string; name: string; image?: ImageSet };
  limits: ReviewLimits;
  onDone: () => void;
};

/** A new review of the product; once the store has it, when it will show, in the store's words. */
export function WriteReview({ product, limits, onDone }: WriteReviewProps) {
  const t = useTranslations('reviewWrite');
  const sending = useWriteReview(product);

  if (sending.review) {
    return (
      <SuccessState
        title={t('sentTitle')}
        body={limits.publicationMessage}
        actions={<Button label={t('done')} onPress={onDone} />}
      />
    );
  }
  return (
    <ReviewForm
      product={product}
      limits={limits}
      pending={sending.isPending}
      error={sending.error}
      onSubmit={sending.submit}
    />
  );
}
