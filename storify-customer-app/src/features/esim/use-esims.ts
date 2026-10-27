import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getEsim, getEsims, refreshEsim } from '@/api/endpoints/esims';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

/** The shopper's eSIMs, newest first. */
export function useEsims() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimList(locale),
    queryFn: ({ signal }) => getEsims(locale, signal),
    select: (data) => data.items,
    staleTime: STALE.private,
  });
}

/** One eSIM, with its usage and how to install it. */
export function useEsim(id: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esim(locale, id),
    queryFn: ({ signal }) => getEsim(locale, id, signal),
    staleTime: STALE.private,
  });
}

/**
 * Asks the supplier for fresh usage. The store answers with the eSIM as it
 * now is, which replaces the copy on screen; the list is asked for again.
 */
export function useRefreshEsim(id: string) {
  const locale = useLocale();
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => refreshEsim(locale, id),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.esim(locale, id), detail);
      void client.invalidateQueries({ queryKey: queryKeys.esimList(locale) });
    },
  });
}
