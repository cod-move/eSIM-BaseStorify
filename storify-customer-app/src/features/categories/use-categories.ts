import { useQuery } from '@tanstack/react-query';

import { getCategories } from '@/api/endpoints/categories';
import { etagQuery, type Cached } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import type { Category, CategoryTree } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/** The store's top-level categories, each with its own sub-categories. */
export function useCategories() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.categories(locale),
    queryFn: etagQuery((options) => getCategories(locale, options)),
    select: (cached: Cached<CategoryTree>) => cached.data.items,
  });
}

/**
 * One category, at whatever depth the tree puts it. Its `data` is `undefined`
 * once the tree has loaded and holds no such category.
 */
export function useCategory(slug: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.categories(locale),
    queryFn: etagQuery((options) => getCategories(locale, options)),
    select: (cached: Cached<CategoryTree>) => findCategory(cached.data.items, slug),
  });
}

/** A category of the tree, at any depth, by its slug. */
export function findCategory(tree: Category[], slug: string): Category | undefined {
  for (const category of tree) {
    if (category.slug === slug) return category;
    const inside = findCategory(category.children, slug);
    if (inside) return inside;
  }
  return undefined;
}
