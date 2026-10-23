import type { ListQuery } from '@/contracts/mobile/shop/v1';

export const vendorsKeys = {
  vendors: (locale: string, query: ListQuery) => ['public', locale, 'vendors', query] as const,
  vendor: (locale: string, slug: string) => ['public', locale, 'vendor', slug] as const,
};
