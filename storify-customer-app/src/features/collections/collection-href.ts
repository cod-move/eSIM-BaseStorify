import type { Href } from 'expo-router';

/** The list of every collection, as on the website: `/collections`. */
export const COLLECTIONS_HREF: Href = { pathname: '/collections' };

/** One collection's page: `/collections/{slug}`. */
export function collectionHref(slug: string): Href {
  return { pathname: '/collections/[slug]', params: { slug } };
}
