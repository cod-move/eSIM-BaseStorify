import { CollectionDetail, CollectionList, type ListQuery } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** GET /collections: every collection of the store, a page at a time. */
export function getCollections(locale: string, query: ListQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/collections', query, signal }, CollectionList);
}

/** GET /collections/{slug}. Its products are `GET /products?collection=`. */
export function getCollection(locale: string, slug: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/collections/${encodeURIComponent(slug)}`, etag, signal },
    CollectionDetail
  );
}
