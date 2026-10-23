import { useInfiniteQuery } from '@tanstack/react-query';

import { getCollections } from '@/api/endpoints/collections';
import { queryKeys } from '@/api/query-keys';
import { LIST_MAX_LIMIT } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/** Every collection of the store, a page at a time as the shopper scrolls. */
export function useCollections() {
  const locale = useLocale();

  return useInfiniteQuery({
    queryKey: queryKeys.collections(locale, { limit: LIST_MAX_LIMIT }),
    queryFn: ({ pageParam, signal }) =>
      getCollections(locale, { cursor: pageParam, limit: LIST_MAX_LIMIT }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}
