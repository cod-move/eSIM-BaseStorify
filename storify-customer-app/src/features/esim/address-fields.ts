import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/api';
import { STALE } from '@/api/query-client';
import { EsimAddressFields } from '@/contracts/mobile/shop/v1/esim';
import { useLocale } from '@/i18n/locale-store';

/**
 * The address fields as the store's checkout asks for them (Settings →
 * Checkout): required, optional or hidden. The address book follows them, so
 * an address it saves is one checkout takes as complete.
 */
export type AddressFieldVisibility = 'required' | 'optional' | 'hidden';

export function useStoreAddressFields(): Record<string, AddressFieldVisibility> | null {
  const locale = useLocale();
  const query = useQuery({
    queryKey: ['esim-address-fields', locale],
    queryFn: ({ signal }) =>
      api.data({ locale, path: '/esim/address-fields', signal }, EsimAddressFields),
    staleTime: STALE.public,
  });
  if (!query.data) return null;
  return Object.fromEntries(
    Object.entries(query.data.fields).map(([field, value]) => [field, value.visibility])
  );
}
