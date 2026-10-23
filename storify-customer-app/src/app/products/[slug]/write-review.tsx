import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { ReviewSheet } from '@/features/reviews-write/review-sheet';
import { useReviewTarget } from '@/features/reviews-write/use-review-target';
import { WriteReview } from '@/features/reviews-write/write-review';

/** Writing a review of the product, a sheet over its page. */
export default function WriteReviewScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTranslations('reviewWrite');
  const target = useReviewTarget(slug);

  return (
    <ReviewSheet slug={slug} title={t('title')}>
      {(close) => {
        if (target.status === 'pending') return <LoadingState />;
        if (target.status === 'error') {
          return <ErrorState error={target.error} onRetry={target.retry} />;
        }
        if (target.status === 'closed') {
          return <EmptyState icon="star" title={t('cannotTitle')} body={t('cannotBody')} />;
        }
        return <WriteReview product={target.product} limits={target.limits} onDone={close} />;
      }}
    </ReviewSheet>
  );
}
