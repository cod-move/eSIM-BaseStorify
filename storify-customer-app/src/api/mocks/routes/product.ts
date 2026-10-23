/** The product page, and the seller its tile shows. */
import { findProduct, findVendor } from '../fixtures/product';
import { MockError, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: /^\/products\/(?!facets$)([^/]+)$/,
    handle: ({ locale }, [slug = '']) => {
      const product = findProduct(slug, locale);
      if (!product) throw new MockError(404, 'NOT_FOUND', 'Product not found');
      return product;
    },
  },
  {
    method: 'GET',
    path: /^\/vendors\/([^/]+)$/,
    handle: (_request, [slug = '']) => {
      const vendor = findVendor(slug);
      if (!vendor) throw new MockError(404, 'NOT_FOUND', 'Vendor not found');
      return vendor;
    },
  },
];
