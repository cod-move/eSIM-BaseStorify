import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getEsimKyc,
  getEsimReferralFriends,
  getEsimReferrals,
  getEsimRewards,
  getEsimRewardsHistory,
  getEsimWallet,
  linkEsimTelegram,
  redeemEsimReward,
  unlinkEsimTelegram,
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
    // Asked again each time the screen opens: the store may have turned referrals on or off since.
    refetchOnMount: 'always',
  });
}

/** The rewards centre (福利中心), read again each time the screen opens. */
export function useEsimRewards() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.esimRewards(locale),
    queryFn: ({ signal }) => getEsimRewards(locale, signal),
    staleTime: STALE.private,
    refetchOnMount: 'always',
  });
}

/** History past the first page, read when the shopper asks for more. */
export function useEsimRewardsHistory(enabled: boolean) {
  const locale = useLocale();
  return useInfiniteQuery({
    queryKey: [...queryKeys.esimRewards(locale), 'history'],
    queryFn: ({ pageParam, signal }) => getEsimRewardsHistory(locale, pageParam, signal),
    initialPageParam: 2,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    staleTime: STALE.private,
    enabled,
  });
}

/** A one-time link to the check-in bot (opened by the caller). */
export function useLinkEsimTelegram() {
  const locale = useLocale();
  return useMutation({ mutationFn: () => linkEsimTelegram(locale) });
}

/** Unlinks Telegram; the centre is read again. */
export function useUnlinkEsimTelegram() {
  const locale = useLocale();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unlinkEsimTelegram(locale),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.esimRewards(locale) }),
  });
}

/** Exchanges saved data for an eSIM; the centre and the eSIM list are read again. */
export function useRedeemEsimReward() {
  const locale = useLocale();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, requestId }: { itemId: string; requestId: string }) =>
      redeemEsimReward(locale, itemId, requestId),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.esimRewards(locale) });
      void client.invalidateQueries({ queryKey: queryKeys.esimList(locale) });
    },
  });
}

/**
 * The friends after the first page the centre brought, a page at a time,
 * once the shopper asks for more. Under the centre's key, so reading the
 * centre again reads these again too.
 */
export function useEsimReferralFriends(enabled: boolean) {
  const locale = useLocale();
  return useInfiniteQuery({
    queryKey: [...queryKeys.esimReferrals(locale), 'friends'],
    queryFn: ({ pageParam, signal }) => getEsimReferralFriends(locale, pageParam, signal),
    initialPageParam: 2,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    staleTime: STALE.private,
    enabled,
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
