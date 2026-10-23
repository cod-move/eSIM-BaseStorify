import type { Href } from 'expo-router';

import type { Category } from '@/contracts/mobile/shop/v1';

/** A category's products: the whole category, sub-categories included. */
export function productsHref(category: Pick<Category, 'slug'>): Href {
  return { pathname: '/products', params: { category: category.slug } };
}

/**
 * Where a tap on a category leads. One with sub-categories opens its own page
 * to choose among them; one without opens its products at once.
 */
export function categoryHref(category: Pick<Category, 'slug' | 'children'>): Href {
  if (category.children.length === 0) return productsHref(category);
  return { pathname: '/categories/[slug]', params: { slug: category.slug } };
}
