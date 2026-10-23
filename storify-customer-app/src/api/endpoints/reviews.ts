/** Endpoints: reviews of a product. */
import { ProductReviews, type ProductReviewsQuery } from '@/contracts/mobile/shop/v1';

import { api } from '../api';

/** A page of the product's approved reviews, with the summary of all of them. */
export function getProductReviews(
  locale: string,
  slug: string,
  query: ProductReviewsQuery,
  signal: AbortSignal
) {
  return api.data(
    { locale, path: `/products/${encodeURIComponent(slug)}/reviews`, query, signal },
    ProductReviews
  );
}
