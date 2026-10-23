/** The collection list and a collection's page. Its products come from `/products?collection=`. */
import type { CollectionList } from '@/contracts/mobile/shop/v1';

import { findCollection, listCollections } from '../fixtures/collections';
import { MockError, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/collections',
    handle: (): CollectionList => ({ items: listCollections(), nextCursor: null }),
  },
  {
    method: 'GET',
    path: /^\/collections\/([^/]+)$/,
    handle: (_ctx, [slug = '']) => {
      const collection = findCollection(slug);
      if (!collection) throw new MockError(404, 'NOT_FOUND', 'Collection not found');
      return collection;
    },
  },
];
