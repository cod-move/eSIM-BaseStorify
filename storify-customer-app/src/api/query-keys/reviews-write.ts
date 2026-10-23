export const reviewsWriteKeys = {
  /** Every list of a product's reviews, whatever its filter: asked again once a review is written. */
  allProductReviews: (locale: string, slug: string) =>
    ['public', locale, 'product-reviews', slug] as const,
  /** Every page of the shopper's reviews of one star rating, or of all. */
  myReviews: (locale: string, rating: number | undefined) =>
    ['private', locale, 'my-reviews', rating ?? 'all'] as const,
  /** The shopper's reviews, whatever the filter: asked again once one is changed. */
  allMyReviews: (locale: string) => ['private', locale, 'my-reviews'] as const,
  /** The products waiting for the shopper's review. */
  reviewsWaiting: (locale: string) => ['private', locale, 'reviews-waiting'] as const,
};
