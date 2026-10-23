/** The mock store's data for: writing reviews. */
import type { MyReview, ReviewLimits } from '@/contracts/mobile/shop/v1';

import { UPLOAD_POLICY } from './uploads';

/** What a review may hold in the mock store: the design's 1000 characters and 10 photos. */
export const REVIEW_LIMITS: ReviewLimits = {
  titleMaxLength: 120,
  textMinLength: 10,
  textMaxLength: 1000,
  maxPhotos: 10,
  photo: UPLOAD_POLICY,
  publication: 'AFTER_MODERATION',
  publicationMessage: 'Your review will show once the store has approved it.',
};

/** Where a new review stands, in the store's words. */
export const PENDING_STATUS = { status: 'PENDING', statusMessage: 'Waiting for approval' };

/** What the store says when a review it took down is changed. */
export const NOT_EDITABLE_MESSAGE =
  'The store took this review down, so it can no longer be changed.';

/**
 * The reviews every shopper of the mock store starts with, of its first
 * products in order: one published with the store's reply, one waiting, and
 * one the store took down.
 */
export const SEED_REVIEWS: Omit<MyReview, 'id' | 'product'>[] = [
  {
    rating: 5,
    title: 'Exactly as pictured',
    text: 'Well made and arrived quickly. The colour is just like the photos, and it still looks new after weeks of use.',
    photos: [],
    status: 'PUBLISHED',
    statusMessage: 'Published',
    canEdit: true,
    verifiedPurchase: true,
    reply: { comment: 'Thank you for your kind words!', createdAt: '2026-09-28T09:00:00Z' },
    createdAt: '2026-09-27T10:00:00Z',
  },
  {
    rating: 4,
    text: 'Good value for the price. The size runs a little small, so order one up.',
    photos: [],
    ...PENDING_STATUS,
    canEdit: true,
    verifiedPurchase: true,
    createdAt: '2026-09-20T15:30:00Z',
  },
  {
    rating: 1,
    title: 'Not happy',
    text: 'This review broke the store’s rules and was taken down.',
    photos: [],
    status: 'REJECTED',
    statusMessage: 'Removed by the store',
    canEdit: false,
    verifiedPurchase: true,
    createdAt: '2026-09-02T08:15:00Z',
  },
];

/** The order the mock store's products waiting for a review came on. */
export const WAITING_ORDER = {
  orderId: 'ord-1042',
  orderNumber: '1042',
  deliveredAt: '2026-10-01T12:00:00Z',
};

/** How many products wait for a review in the mock store. */
export const WAITING_COUNT = 2;
