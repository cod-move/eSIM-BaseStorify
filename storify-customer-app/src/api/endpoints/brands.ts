import { BrandDetail, BrandList, type ListQuery } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** GET /brands: every brand of the store with its logo, a page at a time. */
export function getBrands(locale: string, query: ListQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/brands', query, signal }, BrandList);
}

/** GET /brands/{slug}. Its products are `GET /products?brand=`. */
export function getBrand(locale: string, slug: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/brands/${encodeURIComponent(slug)}`, etag, signal },
    BrandDetail
  );
}
