import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { MyReviewList } from '@/features/my-reviews/my-review-list';
import { useMyReviews } from '@/features/my-reviews/use-my-reviews';

/** The shopper's reviews, and the products waiting for one. Signed-in shoppers only. */
export default function MyReviewsScreen() {
  const t = useTranslations('myReviews');
  const [rating, setRating] = useState<number>();
  const reviews = useMyReviews(rating);

  const body = () => {
    if (reviews.isPending) return <LoadingState />;
    if (reviews.isError) {
      return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;
    }
    return (
      <MyReviewList
        reviews={reviews.data.reviews}
        limits={reviews.data.limits}
        rating={rating}
        onRating={setRating}
        hasMore={reviews.hasNextPage}
        loadingMore={reviews.isFetchingNextPage}
        onMore={() => void reviews.fetchNextPage()}
        empty={
          rating === undefined ? (
            <EmptyState icon="star" title={t('emptyTitle')} body={t('emptyBody')} />
          ) : (
            <EmptyState
              icon="star"
              title={t('emptyRatingTitle')}
              action={
                <Button
                  label={t('showAll')}
                  variant="outline"
                  onPress={() => setRating(undefined)}
                />
              }
            />
          )
        }
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {body()}
    </>
  );
}
