import { ProductComparison } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** The store's comparison of these products (product slugs, in column order), as its `/compare?products=…` page. */
export function getComparison(
  locale: string,
  slugs: readonly string[],
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, path: '/compare', query: { products: slugs.join(',') }, etag, signal },
    ProductComparison
  );
}
