import { useMutation } from '@tanstack/react-query';

import { trackOrder } from '@/api/endpoints/guest-tracking';
import { queryKeys } from '@/api/query-keys';
import type { TrackOrderRequest } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/**
 * Looks a guest's order up by its number and contact. A mutation, not a query:
 * the contact is sent in the body and never kept in a cache key. The order it
 * answers is read-only.
 */
export function useTrackOrder() {
  const locale = useLocale();

  return useMutation({
    mutationKey: queryKeys.guestTrack(locale),
    mutationFn: (request: TrackOrderRequest) => trackOrder(locale, request),
  });
}
