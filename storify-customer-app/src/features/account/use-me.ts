import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { changePassword, deleteAccount, getMe, updateMe } from '@/api/endpoints/me';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type {
  ChangePasswordRequest,
  DeleteAccountRequest,
  UpdateMeRequest,
} from '@/contracts/mobile/shop/v1';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useLocale } from '@/i18n/locale-store';

/** The signed-in shopper's profile. `enabled` false asks nothing: for a screen a guest also sees. */
export function useMe(enabled = true) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.me(locale),
    queryFn: ({ signal }) => getMe(locale, signal),
    staleTime: STALE.private,
    enabled,
  });
}

/** Saves the profile. The store answers the whole profile, which replaces the cached one. */
export function useUpdateMe() {
  const locale = useLocale();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (changes: UpdateMeRequest) => updateMe(locale, changes),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me(locale), me),
  });
}

/** Changes the password. Every other device is signed out; this one stays. */
export function useChangePassword() {
  const locale = useLocale();

  return useMutation({
    mutationFn: (request: ChangePasswordRequest) => changePassword(locale, request),
  });
}

/**
 * Deletes the account, then signs this phone out the usual way: its session,
 * its guest cart and the departed shopper's cached data all go.
 */
export function useDeleteAccount() {
  const locale = useLocale();
  const { signOut } = useSignOut();

  return useMutation({
    mutationFn: (request: DeleteAccountRequest) => deleteAccount(locale, request),
    onSuccess: () => signOut(),
  });
}
