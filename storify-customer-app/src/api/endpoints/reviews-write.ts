/** Endpoints: writing reviews, and the shopper's own reviews. */
import {
  MyReview,
  MyReviewList,
  WaitingReviews,
  type CreateReviewRequest,
  type MyReviewListQuery,
  type UpdateReviewRequest,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/**
 * Writes the shopper's review of a product. One `idempotencyKey` per review:
 * a retry with it gets the review already written, never a second one.
 */
export function createReview(
  locale: string,
  productId: string,
  body: CreateReviewRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      path: `/products/${encodeURIComponent(productId)}/reviews`,
      method: 'POST',
      body,
      auth: 'user',
      idempotencyKey,
    },
    MyReview
  );
}

/** GET /me/reviews: the shopper's reviews, newest first, of one star rating when `rating` is sent. */
export function getMyReviews(
  locale: string,
  query: MyReviewListQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, path: '/me/reviews', query, auth: 'user', etag, signal },
    MyReviewList
  );
}

/** GET /me/reviews/waiting: products delivered to the shopper and not reviewed yet. */
export function getWaitingReviews(locale: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: '/me/reviews/waiting', auth: 'user', etag, signal },
    WaitingReviews
  );
}

/** PATCH /me/reviews/{id}: only the fields sent change. Refused with `NOT_EDITABLE` once the store took it down. */
export function updateReview(locale: string, id: string, body: UpdateReviewRequest) {
  return api.data(
    {
      locale,
      path: `/me/reviews/${encodeURIComponent(id)}`,
      method: 'PATCH',
      body,
      auth: 'user',
    },
    MyReview
  );
}
