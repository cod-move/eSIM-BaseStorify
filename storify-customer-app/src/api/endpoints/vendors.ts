import { VendorDetail, VendorList, type ListQuery } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** GET /vendors: every seller of a multi-vendor store, a page at a time. */
export function getVendors(locale: string, query: ListQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/vendors', query, signal }, VendorList);
}

/** GET /vendors/{slug}. Its products are `GET /products?vendor=`. */
export function getVendor(locale: string, slug: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/vendors/${encodeURIComponent(slug)}`, etag, signal },
    VendorDetail
  );
}
