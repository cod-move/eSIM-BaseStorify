/** The brand list and a brand's page. Its products come from `/products?brand=`. */
import type { BrandList } from '@/contracts/mobile/shop/v1';

import { findBrand, listBrands } from '../fixtures/brands';
import { MockError, type MockContext, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/brands', handle: brandList },
  {
    method: 'GET',
    path: /^\/brands\/([^/]+)$/,
    handle: (_ctx, [slug = '']) => {
      const brand = findBrand(slug);
      if (!brand) throw new MockError(404, 'NOT_FOUND', 'Brand not found');
      return brand;
    },
  },
];

/** A page of the list. The cursor is opaque to the app; here it happens to be an offset. */
function brandList({ query }: MockContext): BrandList {
  const all = listBrands();
  const offset = Number(query.get('cursor') ?? 0);
  const limit = Math.min(Number(query.get('limit') ?? 20), 40);
  return {
    items: all.slice(offset, offset + limit),
    nextCursor: offset + limit < all.length ? String(offset + limit) : null,
  };
}
