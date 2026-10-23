import type { ListQuery } from '@/contracts/mobile/shop/v1';

export const brandsKeys = {
  brands: (locale: string, query: ListQuery) => ['public', locale, 'brands', query] as const,
  brand: (locale: string, slug: string) => ['public', locale, 'brand', slug] as const,
};
