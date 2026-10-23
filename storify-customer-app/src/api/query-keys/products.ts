import type { ListQuery, ProductFacetsQuery, ProductListQuery } from '@/contracts/mobile/shop/v1';

export const productsKeys = {
  products: (locale: string, query: ProductListQuery) =>
    ['public', locale, 'products', query] as const,
  productFacets: (locale: string, query: ProductFacetsQuery) =>
    ['public', locale, 'products', 'facets', query] as const,
  brandLogos: (locale: string, query: ListQuery) => ['public', locale, 'brands', query] as const,
};
