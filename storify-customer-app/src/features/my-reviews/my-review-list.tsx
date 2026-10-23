import { useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Text } from '@/components/ui/text';
import type { MyReview, ReviewLimits } from '@/contracts/mobile/shop/v1';

import { EditReviewSheet } from './edit-review';
import { MyReviewCard } from './my-review-card';
import { RatingFilter } from './rating-filter';
import { useWaitingReviews } from './use-my-reviews';
import { WaitingReviews } from './waiting-reviews';

type MyReviewListProps = {
  reviews: MyReview[];
  /** The store's limits for a review, which an edit is checked against. */
  limits: ReviewLimits | undefined;
  rating: number | undefined;
  onRating: (rating: number | undefined) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  /** What shows in place of the cards when there are none. */
  empty: ReactElement;
};

/**
 * The products waiting for a review, "N products rated" with the rating
 * filter at the end (once there is something rated or a filter chosen), then
 * one card per review, 12 pt apart, more loading as the shopper scrolls. Edit
 * opens the write-review sheet filled in.
 */
export function MyReviewList({
  reviews,
  limits,
  rating,
  onRating,
  hasMore,
  loadingMore,
  onMore,
  empty,
}: MyReviewListProps) {
  const t = useTranslations('myReviews');
  const tabBar = useTabBarHeight();
  const waiting = useWaitingReviews();
  const waitingItems = waiting.data?.items ?? [];
  const opened = useRef(0);
  const [editing, setEditing] = useState<{ review: MyReview; opened: number }>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const edit = (review: MyReview) => {
    opened.current += 1;
    setEditing({ review, opened: opened.current });
    setSheetOpen(true);
  };

  // With products waiting above, a quiet line says where reviews will go; the
  // full "No reviews yet" only when there is nothing at all, and nothing at
  // all is said until the waiting products have been asked for.
  const emptyOf = () => {
    if (rating !== undefined) return empty;
    if (waiting.isPending) return null;
    if (waitingItems.length > 0) {
      return (
        <Text variant="caption" className="pt-2 text-center">
          {t('emptyBody')}
        </Text>
      );
    }
    return empty;
  };

  return (
    <>
      <FlatList
        data={reviews}
        keyExtractor={(review) => review.id}
        className="flex-1 bg-background"
        contentContainerClassName="gap-3 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: tabBar + 16 }}
        ListHeaderComponent={
          <View className="gap-5 pb-1">
            <WaitingReviews
              items={waitingItems}
              failed={waiting.isError}
              retrying={waiting.isFetching}
              onRetry={() => void waiting.refetch()}
            />
            {/* Nothing rated and no filter: no "0 products rated" over the waiting products. */}
            {reviews.length > 0 || rating !== undefined ? (
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Text variant="heading" accessibilityRole="header">
                  {hasMore ? t('ratedMany') : t('rated', { count: reviews.length })}
                </Text>
                <RatingFilter rating={rating} onRating={onRating} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={emptyOf()}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !loadingMore) onMore();
        }}
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <MyReviewCard
            review={item}
            onEdit={item.canEdit && limits ? () => edit(item) : undefined}
          />
        )}
      />
      {limits ? (
        <EditReviewSheet
          editing={editing}
          visible={sheetOpen}
          limits={limits}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}
