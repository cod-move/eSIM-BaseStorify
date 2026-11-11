import type { Href } from 'expo-router';

import type { EsimDestination } from '@/contracts/mobile/shop/v1/esim';

/** The Destinations tab (patch P49); typed by hand until the route types are regenerated. */
export const DESTINATIONS_TAB = '/destinations' as Href;

/**
 * The screen a destination lives at, the website's own paths: a country at
 * `/esim/japan`, a region at `/esim/region/europe`, the global plan at
 * `/esim/global`.
 */
export function destinationHref(destination: Pick<EsimDestination, 'slug' | 'scope'>) {
  if (destination.scope === 'local') {
    return { pathname: '/esim/[country]', params: { country: destination.slug } } as const;
  }
  if (destination.scope === 'global' && destination.slug === 'global')
    return '/esim/global' as const;
  return { pathname: '/esim/region/[slug]', params: { slug: destination.slug } } as const;
}
