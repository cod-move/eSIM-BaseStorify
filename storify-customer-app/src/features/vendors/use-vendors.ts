import { useInfiniteQuery } from '@tanstack/react-query';

import { getVendors } from '@/api/endpoints/vendors';
import { queryKeys } from '@/api/query-keys';
import { LIST_MAX_LIMIT } from '@/contracts/mobile/shop/v1';
import { useConfig } from '@/features/config/use-config';
import { useLocale } from '@/i18n/locale-store';

/**
 * Whether the store has several sellers, and so a list of them. `undefined`
 * until the store's settings are known. A store with one answers 404 to the
 * vendor endpoints, so a link to the list is made only where this is `true`.
 */
export function useMultiVendor(): boolean | undefined {
  return useConfig().data?.features.multiVendor;
}

/**
 * Every seller of the store, a page at a time as the shopper scrolls. Asked only
 * of a multi-vendor store; `available` says whether the store has such a list.
 */
export function useVendors() {
  const locale = useLocale();
  const multiVendor = useMultiVendor();

  const vendors = useInfiniteQuery({
    queryKey: queryKeys.vendors(locale, { limit: LIST_MAX_LIMIT }),
    queryFn: ({ pageParam, signal }) =>
      getVendors(locale, { cursor: pageParam, limit: LIST_MAX_LIMIT }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    enabled: multiVendor === true,
  });

  return { ...vendors, available: multiVendor };
}
