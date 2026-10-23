import {
  onlineManager,
  skipToken,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, isApiError, NetworkError } from '@/api/errors';
import { isFinal } from '@/api/attempt';
import { AlreadySending, useKeyedMutation } from '@/api/keyed-mutation';
import { getOperation } from '@/api/endpoints/operations';
import {
  getReturns,
  getReturn,
  getReturnOptions,
  createReturn,
  actOnReturn,
  executeRefund,
  getRefund,
  previewReturn,
  previewRefund,
  getReturnAttachment,
} from '@/api/endpoints/returns';
import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import {
  OperationStatus,
  type Capability,
  type ReturnListQuery,
  type ReturnCreateResult,
  type ReturnActionResult,
  type RefundResult,
} from '@/contracts/mobile/biz/v1';
import type { Cached } from '@/api/etag-query';
import { useSession } from '@/features/auth/use-session';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';
import {
  forgetReturnDraft,
  returnDraftKey,
  updateReturnStore,
  useReturnStore,
  type ReturnWrite,
} from './store';

export function useReturns(filter: Omit<ReturnListQuery, 'cursor'> = {}) {
  const scope = useWorkspaceScope();
  const can = useCan('VIEW_RETURNS');
  const query = useInfiniteQuery({
    queryKey: queryKeys.returnList(scope, filter),
    queryFn:
      scope && can
        ? ({ pageParam, signal }) => getReturns(scope, { ...filter, cursor: pageParam }, signal)
        : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
  // The store filters a tab after paging: a page can come back empty with more after it.
  // While every page read so far is empty, the next is read, so an empty list means none.
  const { data, hasNextPage, isFetching, isError, fetchNextPage } = query;
  const emptySoFar = data?.length === 0;
  useEffect(() => {
    if (emptySoFar && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [emptySoFar, hasNextPage, isFetching, isError, fetchNextPage]);
  return query;
}
export function useReturn(id: string) {
  const scope = useWorkspaceScope();
  const can = useCan('VIEW_RETURNS');
  return useQuery({
    queryKey: queryKeys.returnDetail(scope, id),
    queryFn: scope && can && id ? ({ signal }) => getReturn(scope, id, signal) : skipToken,
  });
}
export function useReturnOptions(orderId: string) {
  const scope = useWorkspaceScope();
  const can = useCan('HANDLE_RETURNS');
  return useQuery({
    queryKey: queryKeys.returnOptions(scope, orderId),
    queryFn:
      scope && can && orderId
        ? ({ signal }) => getReturnOptions(scope, orderId, signal)
        : skipToken,
  });
}
export function useRefund(id: string) {
  const scope = useWorkspaceScope();
  const can = useCan('VIEW_RETURNS');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.refund(scope, id),
    queryFn: scope && can && id ? ({ signal }) => getRefund(scope, id, signal) : skipToken,
    refetchInterval: (q) => (q.state.data?.settlementStatus === 'processing' ? 4000 : false),
  });
  useEffect(() => {
    if (!scope || !can || !query.data) return;
    const result = query.data;
    if (result.order) {
      client.setQueryData(queryKeys.order(scope, result.order.id), { data: result.order });
      void client.invalidateQueries({ queryKey: queryKeys.orderLists(scope) });
    }
    if (result.return) {
      client.setQueryData(queryKeys.returnDetail(scope, result.return.id), result.return);
      void client.invalidateQueries({
        queryKey: queryKeys.returnOptions(scope, result.return.orderId),
      });
    }
    void client.invalidateQueries({ queryKey: queryKeys.returnLists(scope) });
    void client.invalidateQueries({ queryKey: queryKeys.home(scope) });
  }, [scope, can, query.data, client]);
  return query;
}
export function useReturnDraft<T extends object>(
  kind: ReturnWrite['kind'],
  id: string,
  initial: T
) {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const key = user && scope ? returnDraftKey(user.id, scope.workspace, kind, id) : '';
  const stored = useReturnStore((s) => s.entries[key]);
  const owner = useRef('');
  useLayoutEffect(() => {
    owner.current = key;
    return () => {
      owner.current = '';
    };
  }, [key]);
  return {
    key,
    form: (stored?.form as T | undefined) ?? initial,
    dirty: Boolean(stored?.form),
    set: (form: T) => {
      if (key && scope && owner.current === key)
        updateReturnStore(key, scope.workspace, kind, { form });
    },
    clear: () => {
      if (owner.current === key) forgetReturnDraft(key);
    },
  };
}
export class ReturnScopeChanged extends Error {}
export class ReturnUnconfirmed extends Error {
  constructor(readonly key: string) {
    super('Original return/refund operation needs confirmation');
  }
}
/**
 * The store has no record of the attempt's key (GET /operations answered 404
 * `NOT_FOUND`): the write never reached it and nothing changed. The attempt is
 * over; the draft may be reviewed and sent again, under a new key.
 */
export class ReturnNotReceived extends Error {
  constructor(readonly key: string) {
    super('The store has no record of this return/refund operation: nothing changed');
    this.name = 'ReturnNotReceived';
  }
}
type Result = ReturnCreateResult | ReturnActionResult | RefundResult;
const routeOf = (kind: ReturnWrite['kind']) =>
  ({ create: 'returns.create', action: 'returns.action', refund: 'refunds.execute' })[kind];
export function useReturnWrite(kind: ReturnWrite['kind'], id: string) {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const client = useQueryClient();
  const allowed = useCan(kind === 'refund' ? 'ISSUE_REFUNDS' : 'HANDLE_RETURNS');
  const key = user && scope ? returnDraftKey(user.id, scope.workspace, kind, id) : '';
  const attempt = useReturnStore((s) => s.entries[key]?.attempt);
  const owner = useRef({ actor: user?.id, workspace: scope?.workspace, mounted: false, allowed });
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const [recovering, setRecovering] = useState(false);
  useLayoutEffect(() => {
    owner.current = { actor: user?.id, workspace: scope?.workspace, mounted: true, allowed };
    return () => {
      owner.current.mounted = false;
      controller.current?.abort();
    };
  }, [user?.id, scope?.workspace, allowed]);
  type Sent = { scope: WorkspaceScope; actor: string; write: ReturnWrite; storeKey: string };
  const current = (sent: Sent) =>
    owner.current.mounted &&
    owner.current.allowed &&
    owner.current.actor === sent.actor &&
    owner.current.workspace === sent.scope.workspace;
  const publish = async (sent: Sent, result: Result) => {
    await client.cancelQueries({ queryKey: ['private', 'workspace', sent.scope.workspace] });
    if (!current(sent)) throw new ReturnScopeChanged();
    const cases =
      'returns' in result
        ? result.returns
        : 'return' in result && result.return
          ? [result.return]
          : [];
    for (const row of cases) client.setQueryData(queryKeys.returnDetail(sent.scope, row.id), row);
    if ('refundId' in result)
      client.setQueryData(queryKeys.refund(sent.scope, result.refundId), result);
    if ('order' in result && result.order)
      client.setQueryData<Cached<typeof result.order>>(
        queryKeys.order(sent.scope, result.order.id),
        { data: result.order }
      );
    client.setQueryData(queryKeys.operation(sent.scope, result.operation.key), result.operation);
    updateReturnStore(sent.storeKey, sent.scope.workspace, kind, { attempt: undefined });
    for (const queryKey of [
      queryKeys.returnLists(sent.scope),
      queryKeys.home(sent.scope),
      queryKeys.orderLists(sent.scope),
      queryKeys.productLists(sent.scope),
      queryKeys.orderCreationProductLists(sent.scope),
      ...cases.map((r) => queryKeys.returnOptions(sent.scope, r.orderId)),
    ])
      void client.invalidateQueries({ queryKey });
    for (const row of cases) {
      void client.invalidateQueries({ queryKey: queryKeys.order(sent.scope, row.orderId) });
      for (const line of row.items) {
        void client.invalidateQueries({
          queryKey: queryKeys.productStock(sent.scope, line.productId),
        });
        void client.invalidateQueries({ queryKey: queryKeys.product(sent.scope, line.productId) });
        void client.invalidateQueries({
          queryKey: queryKeys.productEditor(sent.scope, line.productId),
        });
      }
    }
  };
  const mutation = useKeyedMutation<Sent, Result>({
    attemptKey: (sent) => [
      'return-write',
      sent.storeKey,
      useReturnStore.getState().entries[sent.storeKey]?.revision ?? 0,
    ],
    send: async (sent, operationKey) => {
      if (!current(sent) || !controller.current || controller.current.signal.aborted)
        throw new ReturnScopeChanged();
      updateReturnStore(sent.storeKey, sent.scope.workspace, kind, {
        attempt: { key: operationKey, routeId: routeOf(kind), write: sent.write },
      });
      try {
        const signal = controller.current.signal;
        const result =
          sent.write.kind === 'create'
            ? await createReturn(sent.scope, sent.write.request, operationKey, signal)
            : sent.write.kind === 'action'
              ? await actOnReturn(
                  sent.scope,
                  sent.write.id,
                  sent.write.request,
                  operationKey,
                  signal
                )
              : await executeRefund(sent.scope, sent.write.request, operationKey, signal);
        if (!current(sent)) throw new ReturnScopeChanged();
        if (result.operation.state !== 'succeeded') throw new ReturnUnconfirmed(operationKey);
        return result;
      } catch (error) {
        if (!current(sent)) throw new ReturnScopeChanged();
        const receipt = OperationStatus.safeParse(
          isApiError(error) ? error.details?.operation : undefined
        );
        if (receipt.success && ['pending', 'unknown'].includes(receipt.data.state))
          throw new ReturnUnconfirmed(operationKey);
        throw error;
      }
    },
    onSuccess: (result, sent) => publish(sent, result),
    onError: (error, sent) => {
      if (current(sent) && isFinal(error))
        updateReturnStore(sent.storeKey, sent.scope.workspace, kind, { attempt: undefined });
    },
  });
  const submit = async (write: ReturnWrite) => {
    if (!scope || !user || !owner.current.mounted || !owner.current.allowed)
      throw new ReturnScopeChanged();
    if (running.current) throw new AlreadySending();
    if (attempt) throw new ReturnUnconfirmed(attempt.key);
    if (!onlineManager.isOnline()) throw new NetworkError('offline');
    running.current = true;
    controller.current = new AbortController();
    try {
      return await mutation.submit({ scope, actor: user.id, write, storeKey: key });
    } finally {
      running.current = false;
    }
  };
  const recover = async () => {
    if (!scope || !user || !attempt) throw new ReturnScopeChanged();
    if (running.current) throw new AlreadySending();
    if (!onlineManager.isOnline()) throw new NetworkError('offline');
    const sent: Sent = { scope, actor: user.id, write: attempt.write, storeKey: key };
    // The attempt is over and nothing was made: the next tap gets a new key.
    const endAttempt = () =>
      updateReturnStore(key, scope.workspace, kind, {
        attempt: undefined,
        revision: (useReturnStore.getState().entries[key]?.revision ?? 0) + 1,
      });
    running.current = true;
    setRecovering(true);
    controller.current = new AbortController();
    try {
      const op = await getOperation(scope, attempt.key, controller.current.signal).catch(
        (error: unknown) => {
          if (!current(sent)) throw new ReturnScopeChanged();
          if (isApiError(error) && error.status === 404 && error.code === 'NOT_FOUND') {
            endAttempt();
            throw new ReturnNotReceived(attempt.key);
          }
          throw error;
        }
      );
      if (!current(sent)) throw new ReturnScopeChanged();
      if (op.routeId !== attempt.routeId) throw new ReturnUnconfirmed(attempt.key);
      if (op.state === 'failed') {
        endAttempt();
        throw new ApiError(409, 'CONFLICT', '', { reason: 'OPERATION_FAILED' });
      }
      if (op.state !== 'succeeded') throw new ReturnUnconfirmed(attempt.key);
      let result: Result;
      if (kind === 'refund') {
        const resource = op.resources.find((r) => r.kind === 'refund');
        if (!resource) throw new ReturnUnconfirmed(attempt.key);
        result = {
          ...(await getRefund(scope, resource.id, controller.current.signal)),
          operation: op,
        };
      } else {
        const resources = op.resources.filter((r) => r.kind === 'return');
        if (!resources.length) throw new ReturnUnconfirmed(attempt.key);
        const rows = await Promise.all(
          resources.map((r) => getReturn(scope, r.id, controller.current!.signal))
        );
        result =
          kind === 'create'
            ? { operation: op, returns: rows }
            : { operation: op, return: rows[0]! };
      }
      if (!current(sent)) throw new ReturnScopeChanged();
      await publish(sent, result);
      return result;
    } finally {
      running.current = false;
      if (current(sent)) setRecovering(false);
    }
  };
  return { submit, recover, attempt, isPending: mutation.isPending || recovering };
}

function useReview<T, R>(
  send: (scope: WorkspaceScope, request: T, signal?: AbortSignal) => Promise<R>,
  capability: Capability
) {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const allowed = useCan(capability);
  const owner = useRef({ actor: user?.id, workspace: scope?.workspace, mounted: false, allowed });
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  useLayoutEffect(() => {
    owner.current = { actor: user?.id, workspace: scope?.workspace, mounted: true, allowed };
    return () => {
      owner.current.mounted = false;
      active.current?.abort();
    };
  }, [user?.id, scope?.workspace, allowed]);
  return {
    isPending: pending,
    review: async (request: T) => {
      if (!scope || !user || !owner.current.mounted || !owner.current.allowed)
        throw new ReturnScopeChanged();
      if (!onlineManager.isOnline()) throw new NetworkError('offline');
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setPending(true);
      const current = () =>
        owner.current.mounted &&
        owner.current.allowed &&
        owner.current.actor === user.id &&
        owner.current.workspace === scope.workspace &&
        !controller.signal.aborted;
      try {
        const result = await send(scope, request, controller.signal);
        if (!current()) throw new ReturnScopeChanged();
        return result;
      } finally {
        if (current()) setPending(false);
      }
    },
  };
}
export const useReturnPreview = () => useReview(previewReturn, 'HANDLE_RETURNS');
export const useRefundPreview = () => useReview(previewRefund, 'ISSUE_REFUNDS');
export const useReturnAttachmentAccess = () =>
  useReview(
    (scope, request: { id: string; uploadId?: string }, signal) =>
      getReturnAttachment(scope, request.id, request.uploadId, signal),
    'VIEW_RETURNS'
  );
