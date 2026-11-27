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

/** A country the store delivers to: `value` is what the address stores, `name` the shopper's word for it. */
export type StoreCountry = { value: string; name: string; code: string };

function useAddressFieldsQuery() {
  const locale = useLocale();
  return useQuery({
    queryKey: ['esim-address-fields', locale],
    queryFn: ({ signal }) =>
      api.data({ locale, path: '/esim/address-fields', signal }, EsimAddressFields),
    staleTime: STALE.public,
  });
}

export function useStoreAddressFields(): Record<string, AddressFieldVisibility> | null {
  const query = useAddressFieldsQuery();
  if (!query.data) return null;
  return Object.fromEntries(
    Object.entries(query.data.fields).map(([field, value]) => [field, value.visibility])
  );
}

/**
 * The countries the store delivers to, in the shopper's language, and the one
 * a new address opens on; null until loaded (or from a store that does not
 * send them), when the country stays a text field.
 */
export function useStoreCountries(): { countries: StoreCountry[]; defaultCountry?: string } | null {
  const query = useAddressFieldsQuery();
  const countries = query.data?.countries;
  if (!countries?.length) return null;
  return { countries, defaultCountry: query.data?.defaultCountry };
}
