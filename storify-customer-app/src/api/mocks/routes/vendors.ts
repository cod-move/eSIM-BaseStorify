/** The vendor list and a vendor's page. Its products come from `/products?vendor=`. */
import type { VendorList } from '@/contracts/mobile/shop/v1';

import { findVendor, listVendors } from '../fixtures/vendors';
import { MockError, type MockContext, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/vendors', handle: vendorList },
  {
    method: 'GET',
    path: /^\/vendors\/([^/]+)$/,
    handle: (_ctx, [slug = '']) => {
      const vendor = findVendor(slug);
      if (!vendor) throw new MockError(404, 'NOT_FOUND', 'Vendor not found');
      return vendor;
    },
  },
];

/** A page of the list. The cursor is opaque to the app; here it happens to be an offset. */
function vendorList({ query }: MockContext): VendorList {
  const all = listVendors();
  const offset = Number(query.get('cursor') ?? 0);
  const limit = Math.min(Number(query.get('limit') ?? 20), 40);
  return {
    items: all.slice(offset, offset + limit),
    nextCursor: offset + limit < all.length ? String(offset + limit) : null,
  };
}
