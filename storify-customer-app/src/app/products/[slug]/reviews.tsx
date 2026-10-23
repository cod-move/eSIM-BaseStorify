import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { ProductReviewEntry } from '@/features/product/product-review-entry';
import { DetailSheet } from '@/features/product/sheets/detail-sheet';
import { ReviewList, ReviewsSummary } from '@/features/product/sheets/reviews-sheet';
import { useProductReviews, useReplySeller } from '@/features/product/sheets/use-reviews';
import { useProduct } from '@/features/product/use-product';

/** The product's reviews, a sheet over its page. */
export default function ReviewsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTranslations('reviews');
  const [rating, setRating] = useState<number>();
  const reviews = useProductReviews(slug, rating);
  const seller = useReplySeller(useProduct(slug).data);

  const body = () => {
    if (reviews.isPending) return <LoadingState />;
    if (reviews.isError) {
      return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;
    }
    const { summary, reviews: items } = reviews.data;
    if (!summary || summary.count === 0) {
      return <EmptyState icon="star" title={t('emptyTitle')} body={t('emptyBody')} />;
    }
    return (
      <View className="gap-4">
        <ReviewsSummary summary={summary} rating={rating} onRating={setRating} />
        {items.length === 0 ? (
          <EmptyState icon="star" title={t('emptyFilteredTitle')} body={t('emptyFilteredBody')} />
        ) : (
          <ReviewList
            reviews={items}
            seller={seller}
            hasMore={reviews.hasNextPage}
            loadingMore={reviews.isFetchingNextPage}
            onMore={() => void reviews.fetchNextPage()}
          />
        )}
      </View>
    );
  };

  return (
    <DetailSheet slug={slug} title={t('title')}>
      <ProductReviewEntry slug={slug} />
      {body()}
    </DetailSheet>
  );
}
