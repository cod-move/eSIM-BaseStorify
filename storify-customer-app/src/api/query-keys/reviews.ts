import type { ProductReviewsQuery } from '@/contracts/mobile/shop/v1';

export const reviewsKeys = {
  /** A product's reviews, one list per rating filter and sort. */
  productReviews: (
    locale: string,
    slug: string,
    query: Omit<ProductReviewsQuery, 'cursor' | 'limit'>
  ) => ['public', locale, 'product-reviews', slug, query] as const,
};
