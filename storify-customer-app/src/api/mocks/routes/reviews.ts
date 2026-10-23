/** Reviews of a product. */
import { ReviewSort } from '@/contracts/mobile/shop/v1';

import { productReviews, sortReviews, summarize } from '../fixtures/reviews';
import { MockError, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: /^\/products\/([^/]+)\/reviews$/,
    handle: ({ query }, [slug = '']) => {
      const reviews = productReviews(slug);
      if (!reviews) throw new MockError(404, 'NOT_FOUND', 'Product not found');

      const rating = query.get('rating');
      const stars = rating === null ? undefined : Number(rating);
      if (stars !== undefined && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) {
        throw new MockError(400, 'VALIDATION_ERROR', 'rating must be a whole number from 1 to 5');
      }
      const sort = ReviewSort.safeParse(query.get('sort') ?? 'NEWEST');
      if (!sort.success) throw new MockError(400, 'VALIDATION_ERROR', 'Unknown sort');

      const matching = sortReviews(
        stars === undefined ? reviews : reviews.filter((review) => review.rating === stars),
        sort.data
      );

      // The cursor is opaque to the app. Here it happens to be an offset.
      const offset = Number(query.get('cursor') ?? 0);
      const limit = Math.min(Number(query.get('limit') ?? 20), 40);
      return {
        items: matching.slice(offset, offset + limit),
        nextCursor: offset + limit < matching.length ? String(offset + limit) : null,
        summary: summarize(reviews),
      };
    },
  },
];
