import { BrandDetail, ProductDetail, VendorDetail } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

export function getProduct(locale: string, slug: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/products/${encodeURIComponent(slug)}`, etag, signal },
    ProductDetail
  );
}

/** The seller tile of a marketplace's product page. */
export function getProductVendor(locale: string, slug: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/vendors/${encodeURIComponent(slug)}`, etag, signal },
    VendorDetail
  );
}

/** The seller tile of a single shop's product page: the product's brand. */
export function getProductBrand(locale: string, slug: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/brands/${encodeURIComponent(slug)}`, etag, signal },
    BrandDetail
  );
}
