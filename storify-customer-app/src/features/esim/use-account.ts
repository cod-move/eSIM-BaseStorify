import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getEsimReferrals, getEsimWallet, setEsimReferralCode } from '@/api/endpoints/esims';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

/** The balance and how to add to it (APP-07). */
export function useEsimWallet() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.esimWallet(locale),
    queryFn: ({ signal }) => getEsimWallet(locale, signal),
    staleTime: STALE.private,
  });
}

/** The referral centre (APP-07). */
export function useEsimReferrals() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.esimReferrals(locale),
    queryFn: ({ signal }) => getEsimReferrals(locale, signal),
    staleTime: STALE.private,
  });
}

/** Chooses another referral code; the centre is read again. */
export function useSetReferralCode() {
  const locale = useLocale();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => setEsimReferralCode(locale, code),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.esimReferrals(locale) }),
  });
}
