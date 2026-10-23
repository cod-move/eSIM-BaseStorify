import { useQuery } from '@tanstack/react-query';

import { getMeSearchStart, getSearchStart } from '@/api/endpoints/search-start';
import { etagQuery, selectData } from '@/api/etag-query';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/** The trending terms and popular categories: the same for everybody. */
export function useSearchStart() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.searchStart(locale),
    queryFn: etagQuery((options) => getSearchStart(locale, options)),
    select: selectData,
    staleTime: STALE.public,
  });
}

/** The signed-in shopper's "For you" shelf. A guest's is empty: nothing is asked. */
export function useForYou() {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useQuery({
    queryKey: queryKeys.meSearchStart(locale),
    queryFn: etagQuery((options) => getMeSearchStart(locale, options)),
    select: selectData,
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
}
