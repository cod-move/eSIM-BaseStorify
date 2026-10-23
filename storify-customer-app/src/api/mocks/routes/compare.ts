/** The comparison of products side by side. */
import { compareProducts } from '../fixtures/compare';
import type { MockRoute } from '../kit';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/compare',
    handle: ({ query, locale }) =>
      compareProducts((query.get('products') ?? '').split(','), locale),
  },
];
