import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useRef } from 'react';

import { isApiError } from '@/api/errors';
import { getMyReviews, getWaitingReviews, updateReview } from '@/api/endpoints/reviews-write';
import { uploadPhoto } from '@/api/endpoints/uploads';
import { etagQuery, selectData, type Cached } from '@/api/etag-query';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { MyReview, MyReviewList, UpdateReviewRequest } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import type { ReviewDraft } from '@/features/reviews-write/review-draft';
import { useLocale } from '@/i18n/locale-store';

const PAGE_SIZE = 20;

type Pages = InfiniteData<Cached<MyReviewList>, string | undefined>;

/**
 * The shopper's reviews, newest first, page after page; of one star rating
 * when `rating` is set, which the store is asked with. Each page goes out with
 * the ETag of the copy held, and a page the store says is unchanged is kept.
 */
export function useMyReviews(rating: number | undefined) {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useInfiniteQuery({
    queryKey: queryKeys.myReviews(locale, rating),
    queryFn: async ({ pageParam, signal, client, queryKey }) => {
      const pages = client.getQueryData<Pages>(queryKey);
      const index = pages?.pageParams.indexOf(pageParam) ?? -1;
      const held = index >= 0 ? pages?.pages[index] : undefined;
      const result = await getMyReviews(
        locale,
        { cursor: pageParam, limit: PAGE_SIZE, rating },
        { etag: held?.etag, signal }
      );
      if (!result.notModified) return { data: result.data, etag: result.etag };
      if (held) return held;
      throw new Error('The store answered "not modified" to a request that had no validator');
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
    select: (data) => ({
      reviews: data.pages.flatMap((page) => page.data.items),
      limits: data.pages[0]?.data.limits,
    }),
    // Another rating keeps the cards shown until its own arrive.
    placeholderData: keepPreviousData,
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
}

/** The products delivered to the shopper and not reviewed yet. */
export function useWaitingReviews() {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useQuery({
    queryKey: queryKeys.reviewsWaiting(locale),
    queryFn: etagQuery((options) => getWaitingReviews(locale, options)),
    select: selectData,
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
}

/**
 * The change as the store takes it: every field, the title `null` when it was
 * emptied, and the whole set of photos in order, each a kept photo's id or a
 * new upload's.
 */
export function updateOf(draft: ReviewDraft, photoIds: string[]): UpdateReviewRequest {
  const title = draft.title.trim();
  return {
    rating: draft.rating,
    title: title === '' ? null : title,
    text: draft.text.trim(),
    photoIds,
  };
}

/** The store's own sentence when it refuses the change because it took the review down. */
export function notEditableMessage(error: unknown): string | undefined {
  return isApiError(error) && error.reason === 'NOT_EDITABLE' ? error.message : undefined;
}

/**
 * Changes one of the shopper's reviews with one PATCH: new photos are uploaded
 * first, in order, and a photo already uploaded is not sent again on a retry.
 * A second tap while the first is on its way does nothing. Whatever the
 * answer, the lists are asked again: the store may have changed the review's
 * status, or taken it down.
 */
export function useEditReview(review: MyReview) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  /** Picked photo's address → its upload id. */
  const uploaded = useRef(new Map<string, string>());
  const sending = useRef(false);

  const mutation = useMutation({
    mutationFn: async (draft: ReviewDraft) => {
      const photoIds: string[] = [];
      for (const photo of draft.photos) {
        if (photo.kind === 'kept') {
          photoIds.push(photo.photo.id);
          continue;
        }
        let id = uploaded.current.get(photo.file.uri);
        if (id === undefined) {
          id = (await uploadPhoto(locale, photo.file)).id;
          uploaded.current.set(photo.file.uri, id);
        }
        photoIds.push(id);
      }
      return updateReview(locale, review.id, updateOf(draft, photoIds));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allMyReviews(locale) });
    },
  });

  const submit = (draft: ReviewDraft) => {
    if (sending.current) return;
    sending.current = true;
    mutation.mutate(draft, {
      onSettled: () => {
        sending.current = false;
      },
    });
  };

  return {
    submit,
    saved: mutation.data,
    error: mutation.error,
    notEditable: notEditableMessage(mutation.error),
    isPending: mutation.isPending,
  };
}
