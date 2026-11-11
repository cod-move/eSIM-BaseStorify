import { useQuery } from '@tanstack/react-query';

import {
  getEsimDestination,
  getEsimDestinations,
  getEsimDevices,
  getEsimPlanDetails,
} from '@/api/endpoints/esims';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

/** Every destination on sale, in three lists. */
export function useEsimDestinations() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimDestinations(locale),
    queryFn: ({ signal }) => getEsimDestinations(locale, signal),
    staleTime: STALE.public,
  });
}

/** One destination with its plans. */
export function useEsimDestination(scope: 'local' | 'multi', slug: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimDestination(locale, scope, slug),
    queryFn: ({ signal }) => getEsimDestination(locale, scope, slug, signal),
    staleTime: STALE.public,
  });
}

/** One plan explained, asked for when its details open. */
export function useEsimPlanDetails(
  scope: 'local' | 'multi',
  slug: string,
  variantId: string | null
) {
  const locale = useLocale();

  return useQuery({
    queryKey: [...queryKeys.esimDestination(locale, scope, slug), 'plan', variantId],
    queryFn: ({ signal }) => getEsimPlanDetails(locale, scope, slug, variantId ?? '', signal),
    enabled: variantId !== null,
    staleTime: STALE.public,
  });
}

/** Phones that take an eSIM. */
export function useEsimDevices() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.esimDevices(locale),
    queryFn: ({ signal }) => getEsimDevices(locale, signal),
    staleTime: STALE.public,
  });
}
