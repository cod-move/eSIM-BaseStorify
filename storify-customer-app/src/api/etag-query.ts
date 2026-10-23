import type { QueryFunction, QueryKey } from '@tanstack/react-query';

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

/**
 * A query function that revalidates instead of downloading again.
 *
 * The cached answer's ETag goes out with the request. When the store says
 * "not modified", the cached object itself is returned, so nothing re-renders
 * and only a few bytes travelled. A 200 that carries the very ETag already held
 * says the same (a static route never answers 304, it only repeats its ETag),
 * so it gets the same treatment. Kept on the device (see `PERSISTED`), the
 * same pair makes the first request after a restart conditional as well.
 *
 * Read the data with `select: (cached) => cached.data`.
 */
export function etagQuery<T, TKey extends QueryKey = QueryKey>(
  load: (options: Conditional) => Promise<ApiResult<T>>
): QueryFunction<Cached<T>, TKey> {
  return async ({ client, queryKey, signal }) => {
    const previous = client.getQueryData<Cached<T>>(queryKey);
    const result = await load({ etag: previous?.etag, signal });

    if (result.notModified) {
      if (previous) return previous;
      throw new Error('The store answered "not modified" to a request that had no validator');
    }
    if (previous && sameValidator(previous.etag, result.etag)) return previous;
    return { data: result.data, etag: result.etag };
  };
}

export function selectData<T>(cached: Cached<T>): T {
  return cached.data;
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
