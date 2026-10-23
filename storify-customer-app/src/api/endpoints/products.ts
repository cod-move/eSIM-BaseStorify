import {
  ProductFacets,
  ProductList,
  type ProductFacetsQuery,
  type ProductListQuery,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';

export function getProducts(locale: string, query: ProductListQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/products', query, signal }, ProductList);
}

/** What a listing can be narrowed by: its brands, its price range. */
export function getProductFacets(locale: string, query: ProductFacetsQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/products/facets', query, signal }, ProductFacets);
}
