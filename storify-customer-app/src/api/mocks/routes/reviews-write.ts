/**
 * Writing reviews, and the shopper's own. Every product of the mock store
 * counts as delivered to the shopper except one that is out of stock
 * (`NOT_REVIEWABLE`), and each may be reviewed once (`ALREADY_REVIEWED`).
 * Every shopper starts with `SEED_REVIEWS`, one of them taken down by the
 * store (`NOT_EDITABLE`).
 */
import type { MyReview, ProductCard, ReviewProduct } from '@/contracts/mobile/shop/v1';

import { findProduct } from '../fixtures/product';
import { listProducts } from '../fixtures/products';
import {
  NOT_EDITABLE_MESSAGE,
  PENDING_STATUS,
  REVIEW_LIMITS,
  SEED_REVIEWS,
  WAITING_COUNT,
  WAITING_ORDER,
} from '../fixtures/reviews-write';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';
import { state } from '../state';
import { once } from './payments';
import { uploadOf } from './uploads';

/** `user id:product id` of every review written. */
const reviewed = new Set<string>();
/** User id → their reviews, as written. */
const reviewsByUser = new Map<string, MyReview[]>();

function productOf(key: string, locale: string): ProductCard | undefined {
  return findProduct(key, locale) ?? listProducts(locale).find((product) => product.id === key);
}

function refOf(product: ProductCard): ReviewProduct {
  return { id: product.id, slug: product.slug, name: product.name, image: product.image };
}

function inStock(locale: string): ProductCard[] {
  return listProducts(locale).filter((product) => product.availability !== 'OUT_OF_STOCK');
}

/** The shopper's reviews, the seeded ones written on first sight. */
function reviewsOf(userId: string): MyReview[] {
  let reviews = reviewsByUser.get(userId);
  if (!reviews) {
    const products = inStock('en');
    reviews = SEED_REVIEWS.flatMap((seed, index) => {
      const product = products[index];
      if (!product) return [];
      reviewed.add(`${userId}:${product.id}`);
      return [{ ...seed, id: `rev-seed-${index + 1}`, product: refOf(product) }];
    });
    reviewsByUser.set(userId, reviews);
  }
  return reviews;
}

/** The review with its product named in the request's locale. */
function localized(review: MyReview, locale: string): MyReview {
  const product = productOf(review.product.id, locale);
  return product ? { ...review, product: refOf(product) } : review;
}

/** What `GET /me/products/{id}` answers about reviewing the product with this id; an unknown one cannot be reviewed. */
export function reviewStateFor(userId: string, productId: string, locale: string) {
  const product = productOf(productId, locale);
  return product ? reviewStateOf(userId, product) : { canReview: false };
}

/** What `GET /me/products/{id}` answers about reviewing it. */
export function reviewStateOf(userId: string, product: ProductCard) {
  reviewsOf(userId);
  const canReview =
    product.availability !== 'OUT_OF_STOCK' && !reviewed.has(`${userId}:${product.id}`);
  return canReview ? { canReview, reviewLimits: REVIEW_LIMITS } : { canReview };
}

function fieldError(field: string, message: string): never {
  throw new MockError(400, 'VALIDATION_ERROR', message, undefined, { [field]: [message] });
}

function write(ctx: MockContext, key: string): MyReview {
  const user = requireUser(ctx);
  const reviews = reviewsOf(user.id);
  const product = productOf(key, ctx.locale);
  if (!product) throw new MockError(404, 'NOT_FOUND', 'No such product');

  if (reviewed.has(`${user.id}:${product.id}`)) {
    throw new MockError(
      409,
      'CONFLICT',
      'You have already reviewed this product. Change your review instead.',
      'ALREADY_REVIEWED'
    );
  }
  if (product.availability === 'OUT_OF_STOCK') {
    throw new MockError(
      409,
      'CONFLICT',
      'Only a product delivered to you can be reviewed.',
      'NOT_REVIEWABLE'
    );
  }

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const { rating, title, text, uploadIds = [] } = body;
  const limits = REVIEW_LIMITS;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    fieldError('rating', 'Choose from 1 to 5 stars.');
  }
  if (title !== undefined && (typeof title !== 'string' || title.length > limits.titleMaxLength)) {
    fieldError('title', `At most ${limits.titleMaxLength} characters.`);
  }
  if (
    typeof text !== 'string' ||
    text.length < limits.textMinLength ||
    text.length > limits.textMaxLength
  ) {
    fieldError('text', `From ${limits.textMinLength} to ${limits.textMaxLength} characters.`);
  }
  if (!Array.isArray(uploadIds) || uploadIds.length > limits.maxPhotos) {
    fieldError('uploadIds', `At most ${limits.maxPhotos} photos.`);
  }
  const photos = uploadIds.map((id: unknown) => {
    const upload = typeof id === 'string' ? uploadOf(user.id, id) : undefined;
    if (!upload) {
      throw new MockError(400, 'VALIDATION_ERROR', 'A photo was not found.', 'UPLOAD_NOT_FOUND');
    }
    return { id: upload.id, image: upload.image };
  });

  reviewed.add(`${user.id}:${product.id}`);
  const review: MyReview = {
    id: `rev-${state.nextId++}`,
    product: refOf(product),
    rating,
    title: title || undefined,
    text,
    photos,
    ...PENDING_STATUS,
    canEdit: true,
    verifiedPurchase: true,
    createdAt: new Date().toISOString(),
  };
  reviews.push(review);
  return review;
}

function list(ctx: MockContext) {
  const user = requireUser(ctx);
  const ratingParam = ctx.query.get('rating');
  const rating = ratingParam === null ? undefined : Number(ratingParam);
  if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    fieldError('rating', 'Choose from 1 to 5 stars.');
  }
  const cursor = ctx.query.get('cursor');
  const offset = cursor === null ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new MockError(400, 'VALIDATION_ERROR', 'Unknown cursor');
  }
  const limit = Math.min(Math.max(Number(ctx.query.get('limit') ?? 20), 1), 40);
  const reviews = reviewsOf(user.id)
    .filter((review) => rating === undefined || review.rating === rating)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items: reviews.slice(offset, offset + limit).map((review) => localized(review, ctx.locale)),
    nextCursor: offset + limit < reviews.length ? String(offset + limit) : null,
    limits: REVIEW_LIMITS,
  };
}

function waiting(ctx: MockContext) {
  const user = requireUser(ctx);
  reviewsOf(user.id);
  const items = inStock(ctx.locale)
    .filter((product) => !reviewed.has(`${user.id}:${product.id}`))
    .slice(0, WAITING_COUNT)
    .map((product) => ({ product: refOf(product), ...WAITING_ORDER }));
  return { items, limits: REVIEW_LIMITS };
}

/** The photos of a changed review: each one kept from it or one of the shopper's uploads. */
function photosOf(userId: string, review: MyReview, photoIds: unknown) {
  if (photoIds === undefined) return review.photos;
  if (!Array.isArray(photoIds) || photoIds.length > REVIEW_LIMITS.maxPhotos) {
    fieldError('photoIds', `At most ${REVIEW_LIMITS.maxPhotos} photos.`);
  }
  return photoIds.map((photoId: unknown) => {
    const kept = review.photos.find((photo) => photo.id === photoId);
    if (kept) return kept;
    const upload = typeof photoId === 'string' ? uploadOf(userId, photoId) : undefined;
    if (!upload) {
      throw new MockError(400, 'VALIDATION_ERROR', 'A photo was not found.', 'UPLOAD_NOT_FOUND');
    }
    return { id: upload.id, image: upload.image };
  });
}

function change(ctx: MockContext, id: string): MyReview {
  const user = requireUser(ctx);
  const reviews = reviewsOf(user.id);
  const index = reviews.findIndex((review) => review.id === id);
  const review = reviews[index];
  if (!review) throw new MockError(404, 'NOT_FOUND', 'No such review');
  if (!review.canEdit) throw new MockError(409, 'CONFLICT', NOT_EDITABLE_MESSAGE, 'NOT_EDITABLE');

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const { rating = review.rating, text = review.text } = body;
  const limits = REVIEW_LIMITS;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    fieldError('rating', 'Choose from 1 to 5 stars.');
  }
  if (
    typeof text !== 'string' ||
    text.length < limits.textMinLength ||
    text.length > limits.textMaxLength
  ) {
    fieldError('text', `From ${limits.textMinLength} to ${limits.textMaxLength} characters.`);
  }
  let title = review.title;
  if (body.title === null) title = undefined;
  else if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.length > limits.titleMaxLength) {
      fieldError('title', `At most ${limits.titleMaxLength} characters.`);
    }
    title = body.title || undefined;
  }

  const changed: MyReview = {
    ...review,
    rating,
    title,
    text,
    photos: photosOf(user.id, review, body.photoIds),
    ...PENDING_STATUS,
    editedAt: new Date().toISOString(),
  };
  reviews[index] = changed;
  return localized(changed, ctx.locale);
}

export const routes: MockRoute[] = [
  {
    method: 'POST',
    path: /^\/products\/([^/]+)\/reviews$/,
    handle: (ctx, [key = '']) => once(ctx, () => write(ctx, key)),
  },
  { method: 'GET', path: '/me/reviews', handle: list },
  { method: 'GET', path: '/me/reviews/waiting', handle: waiting },
  {
    method: 'PATCH',
    path: /^\/me\/reviews\/([^/]+)$/,
    handle: (ctx, [id = '']) => change(ctx, id),
  },
];

export function reset(): void {
  reviewed.clear();
  reviewsByUser.clear();
}
