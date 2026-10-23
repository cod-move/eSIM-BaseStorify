import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAddress,
  getAddresses,
  removeAddress,
  setDefaultAddress,
  updateAddress,
} from '@/api/endpoints/addresses';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { Address, AddressBook, AddressRequest } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/** The address book, the default first. Asked for only when somebody is signed in. */
export function useAddresses() {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useQuery({
    queryKey: queryKeys.addresses(locale),
    queryFn: ({ signal }) => getAddresses(locale, signal),
    select: (book) => defaultFirst(book.items),
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
}

export function defaultFirst(items: Address[]): Address[] {
  return [...items].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

type Change =
  | { kind: 'create'; address: AddressRequest }
  | { kind: 'update'; id: string; address: AddressRequest }
  | { kind: 'remove'; id: string }
  | { kind: 'default'; id: string };

/**
 * Every change to the book. The store answers with the whole book, which
 * replaces what the screen shows, default and all.
 */
export function useChangeAddresses() {
  const locale = useLocale();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: Change): Promise<AddressBook> => {
      switch (change.kind) {
        case 'create':
          return createAddress(locale, change.address);
        case 'update':
          return updateAddress(locale, change.id, change.address);
        case 'remove':
          return removeAddress(locale, change.id);
        case 'default':
          return setDefaultAddress(locale, change.id);
      }
    },
    onSuccess: (book) => queryClient.setQueryData(queryKeys.addresses(locale), book),
  });
}

/** The fields of the address form, as typed. */
export type AddressForm = {
  label: AddressRequest['label'] & string;
  firstName: string;
  lastName: string;
  street: string;
  apartment: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
};

export type AddressFormField = keyof Omit<AddressForm, 'label'>;
export type AddressFormProblem = 'required' | 'streetTooShort';

/** Checkout refuses a street shorter than this. */
export const MIN_STREET = 5;

export function toForm(address?: Address): AddressForm {
  const known = (['home', 'work', 'other'] as const).find((l) => l === address?.label);
  return {
    label: known ?? 'home',
    firstName: address?.firstName ?? '',
    lastName: address?.lastName ?? '',
    street: address?.street ?? '',
    apartment: address?.apartment ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
    phone: address?.phone ?? '',
  };
}

/** What checkout would refuse, by field. Empty when the form may be sent. */
export function checkForm(
  form: AddressForm
): Partial<Record<AddressFormField, AddressFormProblem>> {
  const problems: Partial<Record<AddressFormField, AddressFormProblem>> = {};
  for (const field of ['firstName', 'street', 'city', 'country'] as const) {
    if (!form[field].trim()) problems[field] = 'required';
  }
  if (!problems.street && form.street.trim().length < MIN_STREET)
    problems.street = 'streetTooShort';
  return problems;
}

/** The request: every field trimmed, the empty optional ones left out. */
export function toRequest(form: AddressForm): AddressRequest {
  const optional = (value: string) => value.trim() || undefined;
  return {
    label: form.label,
    firstName: form.firstName.trim(),
    lastName: optional(form.lastName),
    street: form.street.trim(),
    apartment: optional(form.apartment),
    city: form.city.trim(),
    state: optional(form.state),
    postalCode: optional(form.postalCode),
    country: form.country.trim(),
    phone: optional(form.phone),
  };
}
