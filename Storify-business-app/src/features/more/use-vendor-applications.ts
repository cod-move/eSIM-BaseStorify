import { skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decideVendorApplication,
  getVendorApplication,
  getVendorApplications,
} from '@/api/endpoints/vendor-applications';
import { etagPages, nextCursor } from '@/api/etag-query';
import { useKeyedMutation } from '@/api/keyed-mutation';
import { queryKeys } from '@/api/query-keys';
import type {
  VendorApplicationDecisionRequest,
  VendorApplicationList,
  VendorApplicationListQuery,
} from '@/contracts/mobile/biz/v1';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

/**
 * Sellers' applications: administrators only (`REVIEW_VENDOR_APPLICATIONS`,
 * platform workspace). Show the entry only with that capability.
 */

/** A tab of applications (`pending` by default, the longest waiting first), a page at a time. */
export function useVendorApplications(
  filter: Pick<VendorApplicationListQuery, 'tab' | 'search'> = {}
) {
  const scope = useWorkspaceScope();

  return useInfiniteQuery({
    queryKey: queryKeys.vendorApplicationList(scope, filter),
    queryFn: scope
      ? etagPages<VendorApplicationList>((cursor, options) =>
          getVendorApplications(scope, { ...filter, cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data.items),
  });
}

/**
 * One application with its documents. A document's `url` stops working at its
 * `expiresAt` (minutes): open it on tap, and `refetch` for fresh links when
 * it has expired.
 */
export function useVendorApplication(id: string) {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.vendorApplication(scope, id),
    queryFn: scope ? ({ signal }) => getVendorApplication(scope, id, signal) : skipToken,
  });
}

/**
 * Approves, or rejects with a reason the applicant is told: one
 * `Idempotency-Key` per tap. Refusals: `ALREADY_DECIDED` (409: somebody
 * decided first; the application is read again), `NOT_SUBMITTED` (409),
 * `REASON_REQUIRED` (400). After an approval, `vendorStatus`
 * `payment_required` means the shop opens after its first payment, which is
 * settled on the website.
 */
export function useVendorApplicationDecision(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useKeyedMutation({
    attemptKey: () => ['application-decision', scope?.workspace, id],
    send: (request: VendorApplicationDecisionRequest, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return decideVendorApplication(scope, id, request, idempotencyKey);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.vendorApplication(scope, id), result.application);
    },
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.vendorApplication(scope, id) }),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.vendorApplicationLists(scope) }),
  });
}
