import type { InfiniteData, QueryFunction, QueryKey } from '@tanstack/react-query';

import type { ApiResult } from './client';

/** What a conditional request needs: the validator of the cached copy, and a way to cancel. */
export type Conditional = {
  etag: string | undefined;
  signal: AbortSignal;
};

/** A response kept with the validator the store sent for it. */
export type Cached<T> = {
  data: T;
  etag?: string;
};

/** A page of a list as the cache keeps it: the page, its validator, and the cursor it was asked with. */
export type CachedPages<T> = InfiniteData<Cached<T>, string | undefined>;

/**
 * A query function that revalidates instead of downloading again.
 *
 * The cached answer's ETag goes out with the request. When the store says
 * "not modified", the cached object itself is returned, so nothing re-renders
 * and only a few bytes travelled. A 200 that carries the very ETag already held
 * says the same (a static route never answers 304, it only repeats its ETag),
 * so it gets the same treatment.
 *
 * Read the data with `select: selectData`.
 */
export function etagQuery<T, TKey extends QueryKey = QueryKey>(
  load: (options: Conditional) => Promise<ApiResult<T>>
): QueryFunction<Cached<T>, TKey> {
  return async ({ client, queryKey, signal }) => {
    const previous = client.getQueryData<Cached<T>>(queryKey);
    const result = await load({ etag: previous?.etag, signal });
    return settle(previous, result);
  };
}

/**
 * `etagQuery` for a list read a page at a time (`useInfiniteQuery`). Each page
 * goes out with the validator of the page the cache holds for the same cursor,
 * so pulling to refresh an unchanged list costs a 304 per page.
 *
 * A refetch asks for the pages again from the first, each with the cursor the
 * page before it now gives: when nothing moved the cursors are the same and the
 * validators apply; when something did, the pages that changed come in full.
 *
 * Read the rows with `select: (data) => data.pages.flatMap((page) => page.data.items)`.
 */
export function etagPages<T, TKey extends QueryKey = QueryKey>(
  load: (cursor: string | undefined, options: Conditional) => Promise<ApiResult<T>>
): QueryFunction<Cached<T>, TKey, string | undefined> {
  return async ({ client, queryKey, signal, pageParam }) => {
    const held = client.getQueryData<CachedPages<T>>(queryKey);
    const index = held?.pageParams.indexOf(pageParam) ?? -1;
    const previous = index >= 0 ? held?.pages[index] : undefined;
    const result = await load(pageParam, { etag: previous?.etag, signal });
    return settle(previous, result);
  };
}

/** The cursor of the page after this one, for `getNextPageParam`. */
export function nextCursor(page: Cached<{ nextCursor: string | null }>): string | undefined {
  return page.data.nextCursor ?? undefined;
}

export function selectData<T>(cached: Cached<T>): T {
  return cached.data;
}

function settle<T>(previous: Cached<T> | undefined, result: ApiResult<T>): Cached<T> {
  if (result.notModified) {
    if (previous) return previous;
    throw new Error('The store answered "not modified" to a request that had no validator');
  }
  if (previous && sameValidator(previous.etag, result.etag)) return previous;
  return { data: result.data, etag: result.etag };
}

/** Weak comparison, as for `If-None-Match`: `W/"1"` and `"1"` name the same copy. */
function sameValidator(held: string | undefined, sent: string | undefined): boolean {
  return (
    held !== undefined && sent !== undefined && withoutWeakMark(held) === withoutWeakMark(sent)
  );
}

function withoutWeakMark(etag: string): string {
  return etag.replace(/^W\//, '');
}
