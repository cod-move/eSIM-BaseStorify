import type { ListQuery } from '@/contracts/mobile/shop/v1';

export const collectionsKeys = {
  collections: (locale: string, query: ListQuery) =>
    ['public', locale, 'collections', query] as const,
  collection: (locale: string, slug: string) => ['public', locale, 'collection', slug] as const,
};
