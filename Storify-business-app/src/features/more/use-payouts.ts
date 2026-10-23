import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { getPayout, getPayouts, getPayoutSummary } from '@/api/endpoints/payouts';
import { etagPages, etagQuery, nextCursor, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import type { PayoutList, PayoutListQuery, PayoutSummary } from '@/contracts/mobile/biz/v1';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';

import { choosePayoutCurrency, useChosenPayoutCurrency } from './payout-currency';

/**
 * A seller's money, read only: the vendor workspace with `VIEW_PAYOUTS` (a
 * seller's staff and administrators are refused). Show the screens only with
 * that capability.
 */

/**
 * What is ready to pay, held, reserved, and owed to the store, in the currency
 * the operator chose (`usePayoutCurrency`), else in the store's own. Asked only
 * with `VIEW_PAYOUTS`: the Account tab reads it for its Payouts card.
 *
 * Another currency is another answer: until it arrives there is no `data`,
 * never the last currency's figures.
 */
export function usePayoutSummary() {
  const scope = useWorkspaceScope();
  const can = useCan('VIEW_PAYOUTS');
  const currency = useChosenPayoutCurrency(scope?.workspace ?? null)?.currency;
  const query = currency ? { currency } : {};

  return useQuery({
    queryKey: queryKeys.payoutSummary(scope, query),
    queryFn:
      scope && can ? etagQuery((options) => getPayoutSummary(scope, query, options)) : skipToken,
    select: selectData,
  });
}

/**
 * The currencies the seller's balance can be shown in, as the store lists them
 * (`availableCurrencies`), the one on screen, and the choice of another, kept
 * for this workspace while the same person uses the app. The figures of each
 * are the store's: the app never converts or combines them.
 *
 * While a chosen currency is read, or cannot be, the currencies it was chosen
 * from stay offered.
 */
export function usePayoutCurrency(summary: PayoutSummary | undefined) {
  const workspace = useWorkspaceScope()?.workspace ?? null;
  const chosen = useChosenPayoutCurrency(workspace);
  const offered = summary?.availableCurrencies ?? chosen?.offered ?? [];
  const value = chosen?.currency ?? summary?.readyToPay.currency;

  return {
    offered,
    value,
    choose: (currency: string) => {
      if (workspace && currency !== value) choosePayoutCurrency(workspace, { currency, offered });
    },
  };
}

/** The payouts, newest first, a page at a time. */
export function usePayouts(filter: Pick<PayoutListQuery, 'status'> = {}) {
  const scope = useWorkspaceScope();

  return useInfiniteQuery({
    queryKey: queryKeys.payoutList(scope, filter),
    queryFn: scope
      ? etagPages<PayoutList>((cursor, options) =>
          getPayouts(scope, { ...filter, cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data.items),
  });
}

/** One payout, with what made up its net amount. */
export function usePayout(id: string) {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.payout(scope, id),
    queryFn: scope ? etagQuery((options) => getPayout(scope, id, options)) : skipToken,
    select: selectData,
  });
}
