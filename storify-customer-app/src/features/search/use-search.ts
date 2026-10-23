import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getBrand } from '@/api/endpoints/brands';
import { getCollection } from '@/api/endpoints/collections';
import { getProducts } from '@/api/endpoints/products';
import { getVendor } from '@/api/endpoints/vendors';
import { isApiError } from '@/api/errors';
import { etagQuery, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';
import type { ListingQuery } from '@/lib/listing-query';

/** How long typing has to pause before the panel asks the store. */
const PAUSE_MS = 250;
/** The panel shows this many matches; "View All" opens the rest. */
const PANEL_SIZE = 5;

/** `value`, once it has stopped changing for a short pause. */
export function usePaused<T>(value: T, ms = PAUSE_MS): T {
  const [paused, setPaused] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setPaused(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return paused;
}

/**
 * The first matches of a search, for the panel under the field. A field over a
 * list searches in that list: `scope` is the list's category, brand and filters,
 * so the panel shows the first of what "View All" opens. A new term replaces
 * the request for the last one, and while it loads the last answer stays, so
 * the panel does not flicker.
 */
export function useSearchSuggestions(term: string, scope?: ListingQuery) {
  const locale = useLocale();
  const query = { ...scope, q: term, limit: PANEL_SIZE };

  return useQuery({
    queryKey: queryKeys.products(locale, query),
    queryFn: ({ signal }) => getProducts(locale, query, signal),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useBrand(slug: string) {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.brand(locale, slug),
    queryFn: etagQuery((options) => getBrand(locale, slug, options)),
    select: selectData,
  });
}

export function useCollection(slug: string) {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.collection(locale, slug),
    queryFn: etagQuery((options) => getCollection(locale, slug, options)),
    select: selectData,
  });
}

export function useVendor(slug: string) {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.vendor(locale, slug),
    queryFn: etagQuery((options) => getVendor(locale, slug, options)),
    select: selectData,
  });
}

/** The store has no such brand, collection or seller (a single-seller store has no sellers at all). */
export function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
