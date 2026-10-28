import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getEsimKyc,
  getEsimReferrals,
  getEsimWallet,
  setEsimReferralCode,
  submitEsimKyc,
} from '@/api/endpoints/esims';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { EsimKycSubmitRequest } from '@/contracts/mobile/shop/v1/esim';
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

/** Identity verification: where the shopper stands, and the form. */
export function useEsimKyc() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.esimKyc(locale),
    queryFn: ({ signal }) => getEsimKyc(locale, signal),
    staleTime: STALE.private,
  });
}

/** Sends the answers; the store answers with where the shopper now stands. */
export function useSubmitEsimKyc() {
  const locale = useLocale();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: EsimKycSubmitRequest) => submitEsimKyc(locale, body),
    onSuccess: (state) => client.setQueryData(queryKeys.esimKyc(locale), state),
  });
}
