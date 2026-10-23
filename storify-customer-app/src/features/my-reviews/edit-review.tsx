import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, SuccessState } from '@/components/ui/state-view';
import type { MyReview, ReviewLimits } from '@/contracts/mobile/shop/v1';
import { ReviewForm } from '@/features/reviews-write/review-form';

import { useEditReview } from './use-my-reviews';

type EditReviewProps = {
  review: MyReview;
  limits: ReviewLimits;
  onDone: () => void;
};

/**
 * The write-review form, filled in with the review. Once saved, where it
 * stands in the store's words; refused because the store took it down, the
 * store's own sentence.
 */
export function EditReview({ review, limits, onDone }: EditReviewProps) {
  const t = useTranslations('myReviews');
  const editing = useEditReview(review);

  if (editing.notEditable) {
    return (
      <EmptyState
        icon="star"
        title={t('notEditableTitle')}
        body={editing.notEditable}
        action={<Button label={t('close')} variant="outline" onPress={onDone} />}
      />
    );
  }
  if (editing.saved) {
    return (
      <SuccessState
        title={t('savedTitle')}
        body={editing.saved.statusMessage}
        actions={<Button label={t('done')} onPress={onDone} />}
      />
    );
  }
  return (
    <ReviewForm
      product={review.product}
      limits={limits}
      review={review}
      pending={editing.isPending}
      error={editing.error}
      onSubmit={editing.submit}
    />
  );
}

type EditReviewSheetProps = {
  /** The review last opened: kept while the sheet slides out. */
  editing: { review: MyReview; opened: number } | undefined;
  visible: boolean;
  limits: ReviewLimits;
  onClose: () => void;
};

/** Changing a review, in the tall sheet a review is written in. */
export function EditReviewSheet({ editing, visible, limits, onClose }: EditReviewSheetProps) {
  const t = useTranslations('myReviews');

  return (
    <Sheet visible={visible} title={t('editTitle')} onClose={onClose} size="tall">
      {editing ? (
        <EditReview key={editing.opened} review={editing.review} limits={limits} onDone={onClose} />
      ) : null}
    </Sheet>
  );
}
