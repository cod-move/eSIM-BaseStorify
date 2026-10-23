import {
  onlineManager,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { getOperation } from '@/api/endpoints/operations';
import { getOrder } from '@/api/endpoints/orders';
import {
  createOrder,
  createOrderContact,
  getOrderCreationCustomers,
  getOrderCreationOptions,
  getOrderCreationProducts,
  quoteOrder,
} from '@/api/endpoints/order-creation';
import { ApiError, isApiError, NetworkError } from '@/api/errors';
import { AlreadySending, useKeyedMutation } from '@/api/keyed-mutation';
import type { Cached } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import {
  OperationStatus,
  type ManualOrderCreateRequest,
  type ManualOrderCreateResult,
  type ManualOrderDraftRequest,
  type OrderContactCreateRequest,
  type OrderContactCreateResult,
  type OrderCustomerSelectorQuery,
  type OrderProductSelectorQuery,
} from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';
import { creationFingerprint } from './creation/draft';

export class CreationScopeChanged extends Error {}
/** Checked, the original write had never reached the store: nothing was made. */
export class CreationNotRecorded extends Error {}
export class CreationUnconfirmed extends Error {
  constructor(
    readonly key: string,
    readonly operation?: OperationStatus,
    cause?: unknown
  ) {
    super('Check the original creation before another change', { cause });
  }
}

export function useOrderCreationOptions() {
  const scope = useWorkspaceScope();
  const can = useCan('CREATE_ORDERS');
  return useQuery({
    queryKey: queryKeys.orderCreationOptions(scope),
    queryFn: scope && can ? ({ signal }) => getOrderCreationOptions(scope, signal) : skipToken,
  });
}
export function useOrderCreationProducts(
  filter: Omit<OrderProductSelectorQuery, 'cursor'>,
  enabled: boolean
) {
  const scope = useWorkspaceScope();
  const can = useCan('CREATE_ORDERS');
  return useInfiniteQuery({
    queryKey: queryKeys.orderCreationProducts(scope, filter),
    initialPageParam: undefined as string | undefined,
    queryFn:
      scope && can
        ? ({ pageParam, signal }) =>
            getOrderCreationProducts(scope, { ...filter, cursor: pageParam }, signal)
        : skipToken,
    enabled,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => ({ ...data, items: data.pages.flatMap((page) => page.items) }),
  });
}
export function useOrderCreationCustomers(
  filter: Omit<OrderCustomerSelectorQuery, 'cursor'>,
  enabled: boolean
) {
  const scope = useWorkspaceScope();
  const can = useCan('VIEW_ORDER_CUSTOMERS');
  return useInfiniteQuery({
    queryKey: queryKeys.orderCreationCustomers(scope, filter),
    initialPageParam: undefined as string | undefined,
    queryFn:
      scope && can
        ? ({ pageParam, signal }) =>
            getOrderCreationCustomers(scope, { ...filter, cursor: pageParam }, signal)
        : skipToken,
    enabled,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => ({ ...data, items: data.pages.flatMap((page) => page.items) }),
  });
}
export function useOrderQuote() {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const owner = useRef({ actor: user?.id, workspace: scope?.workspace, mounted: false });
  const active = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    owner.current = { actor: user?.id, workspace: scope?.workspace, mounted: true };
    return () => {
      owner.current.mounted = false;
      active.current?.abort();
    };
  }, [user?.id, scope?.workspace]);
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (request: ManualOrderDraftRequest) => {
      if (!scope || !user) throw new CreationScopeChanged();
      if (!onlineManager.isOnline()) throw new NetworkError('offline');
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      const quote = await quoteOrder(scope, request, controller.signal);
      if (
        controller.signal.aborted ||
        !owner.current.mounted ||
        owner.current.actor !== user.id ||
        owner.current.workspace !== scope.workspace
      )
        throw new CreationScopeChanged();
      return quote;
    },
  });
}

/**
 * A try the store's write gave no answer to (no connection, a server fault,
 * "still running"): it may have been carried out.
 */
const unansweredTry = (error: unknown) =>
  !isApiError(error) || error.status >= 500 || error.code === 'REQUEST_IN_PROGRESS';

/** What checking the original write found: `operation` is null when the store has no record of it. */
export type CreationRecovery<TResult> = { operation: OperationStatus | null; result?: TResult };

function useCreationWrite<TRequest, TResult extends { operation: OperationStatus }>(
  kind: 'order' | 'contact',
  draftId: string,
  send: (
    scope: WorkspaceScope,
    request: TRequest,
    key: string,
    signal?: AbortSignal
  ) => Promise<TResult>,
  resolve: (
    scope: WorkspaceScope,
    operation: OperationStatus,
    request: TRequest | undefined,
    signal: AbortSignal
  ) => Promise<TResult | undefined>,
  /** Puts what the store made in the cache; without `result` when this operator may not read it. */
  publish: (
    scope: WorkspaceScope,
    operation: OperationStatus,
    result: TResult | undefined,
    isCurrent: () => boolean
  ) => Promise<void>
) {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  type Sent = { actor: string; scope: WorkspaceScope; request: TRequest };
  const owner = useRef({ actor: user?.id, workspace: scope?.workspace, draftId, mounted: false });
  const active = useRef<AbortController | null>(null);
  const running = useRef(false);
  const last = useRef<(Sent & { key: string }) | null>(null);
  /** The attempt the store may have carried out: only it may be sent again, with its key. */
  const uncertain = useRef<Sent | null>(null);
  /**
   * The key one of whose tries got no answer. A refusal that comes later for
   * the same key (a 401, 403 or 429 is checked before the key) says nothing
   * about that try, so the attempt stays uncertain; without one, a refusal is
   * the store's definite answer and nothing was made.
   */
  const unanswered = useRef<string | null>(null);
  const settle = () => {
    uncertain.current = null;
    unanswered.current = null;
  };
  const [status, setStatus] = useState<{
    key: string;
    actor: string;
    workspace: string;
    recovering: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    owner.current = { actor: user?.id, workspace: scope?.workspace, draftId, mounted: true };
    return () => {
      owner.current.mounted = false;
      active.current?.abort();
    };
  }, [user?.id, scope?.workspace, draftId]);
  const here = (sent: Sent) =>
    owner.current.mounted &&
    owner.current.actor === sent.actor &&
    owner.current.workspace === sent.scope.workspace &&
    owner.current.draftId === draftId;
  const mutation = useKeyedMutation<Sent, TResult>({
    attemptKey: (sent) => ['manual-creation', kind, sent.actor, sent.scope.workspace, draftId],
    send: async (sent, key) => {
      if (!here(sent) || !active.current || active.current.signal.aborted)
        throw new CreationScopeChanged();
      last.current = { ...sent, key };
      setStatus({ key, actor: sent.actor, workspace: sent.scope.workspace, recovering: false });
      try {
        const result = await send(sent.scope, sent.request, key, active.current.signal);
        if (!here(sent)) throw new CreationScopeChanged();
        if (result.operation.state !== 'succeeded') {
          unanswered.current = key;
          throw new CreationUnconfirmed(key, result.operation);
        }
        return result;
      } catch (error) {
        if (!here(sent)) throw new CreationScopeChanged();
        if (error instanceof CreationUnconfirmed) throw error;
        const operation = OperationStatus.safeParse(
          isApiError(error) ? error.details?.operation : undefined
        );
        // The store names a write it holds a record of: this tap's, still
        // running or unknown, or the one the draft already made. Check it.
        if (operation.success && operation.data.state !== 'failed') {
          if (operation.data.key === key) unanswered.current = key;
          throw new CreationUnconfirmed(operation.data.key, operation.data, error);
        }
        if (unansweredTry(error)) unanswered.current = key;
        throw error;
      }
    },
    onSuccess: async (result, sent) => {
      if (!here(sent)) return;
      settle();
      await publish(sent.scope, result.operation, result, () => here(sent));
      if (!here(sent)) throw new CreationScopeChanged();
    },
    onError: (error, sent) => {
      if (!here(sent)) return;
      const open =
        error instanceof CreationUnconfirmed ||
        (last.current !== null && unanswered.current === last.current.key);
      uncertain.current = open ? sent : null;
    },
  });
  const submit = async (request: TRequest) => {
    if (!scope || !user || !owner.current.mounted) throw new CreationScopeChanged();
    if (running.current) throw new AlreadySending();
    const pending = uncertain.current && here(uncertain.current) ? uncertain.current : null;
    if (pending && creationFingerprint(pending.request) !== creationFingerprint(request))
      throw new CreationUnconfirmed(last.current!.key);
    if (!pending) last.current = null;
    if (!onlineManager.isOnline()) throw new NetworkError('offline');
    active.current = new AbortController();
    running.current = true;
    try {
      return await mutation.submit(pending ?? { request, scope, actor: user.id });
    } finally {
      running.current = false;
    }
  };
  /**
   * Asks the store what became of the write sent with `key`, without sending
   * it again. No record of it (404 `NOT_FOUND`) means it never reached the
   * store's write: the draft is free again, and the attempt keeps its key, so
   * the same request sent again is still made at most once.
   */
  const recover = async (key: string, request?: TRequest): Promise<CreationRecovery<TResult>> => {
    if (!scope || !user || !owner.current.mounted) throw new CreationScopeChanged();
    if (!onlineManager.isOnline()) throw new NetworkError('offline');
    if (running.current) throw new AlreadySending();
    const sent = { actor: user.id, scope, request: request as TRequest };
    const controller = new AbortController();
    active.current = controller;
    running.current = true;
    setStatus({ key, actor: user.id, workspace: scope.workspace, recovering: true });
    try {
      let operation: OperationStatus;
      try {
        operation = await getOperation(scope, key, controller.signal);
      } catch (error) {
        if (!here(sent)) throw new CreationScopeChanged();
        if (!(isApiError(error) && error.status === 404 && error.code === 'NOT_FOUND')) throw error;
        settle();
        return { operation: null };
      }
      if (!here(sent)) throw new CreationScopeChanged();
      if (
        operation.routeId !==
        (kind === 'order' ? 'orders.creation.create' : 'orders.creation.contacts.create')
      )
        throw new ApiError(409, 'CONFLICT', '', { reason: 'OPERATION_RECONCILIATION_REQUIRED' });
      if (operation.state === 'failed') settle();
      if (operation.state !== 'succeeded') return { operation };
      let result: TResult | undefined;
      let unreadable = false;
      try {
        result = await resolve(scope, operation, request, controller.signal);
      } catch (error) {
        if (!here(sent)) throw new CreationScopeChanged();
        // The store made it, and this operator may not read it (an order
        // without VIEW_ORDERS): it is done, without its detail.
        if (!(isApiError(error) && [403, 404].includes(error.status))) throw error;
        unreadable = true;
      }
      if (!here(sent)) throw new CreationScopeChanged();
      if (!result && !unreadable) throw new CreationUnconfirmed(key, operation);
      settle();
      await publish(scope, operation, result, () => here(sent));
      if (!here(sent)) throw new CreationScopeChanged();
      return { operation, result };
    } finally {
      running.current = false;
      if (here(sent))
        setStatus({ key, actor: user.id, workspace: scope.workspace, recovering: false });
    }
  };
  const visible = status?.actor === user?.id && status?.workspace === scope?.workspace;
  return {
    submit,
    recover,
    original: () => last.current,
    /** Whether the last attempt may have been carried out: only it may go again, until checked. */
    unsettled: () => Boolean(uncertain.current && here(uncertain.current)),
    operationKey: visible ? status?.key : null,
    isPending: mutation.isPending || Boolean(visible && status?.recovering),
  };
}

export function useCreateManualOrder(draftId: string) {
  const client = useQueryClient();
  return useCreationWrite<ManualOrderCreateRequest, ManualOrderCreateResult>(
    'order',
    draftId,
    createOrder,
    async (scope, operation, _request, signal) => {
      const id = operation.resources.find((resource) => resource.kind === 'order')?.id;
      if (!id) return;
      const response = await getOrder(scope, id, { etag: undefined, signal });
      return response.notModified ? undefined : { operation, order: response.data };
    },
    async (scope, operation, result, isCurrent) => {
      if (result) {
        const key = queryKeys.order(scope, result.order.id);
        await client.cancelQueries({ queryKey: key, exact: true });
        if (!isCurrent()) throw new CreationScopeChanged();
        client.setQueryData<Cached<ManualOrderCreateResult['order']>>(key, { data: result.order });
      }
      if (!isCurrent()) throw new CreationScopeChanged();
      client.setQueryData(queryKeys.operation(scope, operation.key), operation);
      void client.invalidateQueries({ queryKey: queryKeys.orderLists(scope) });
      void client.invalidateQueries({ queryKey: queryKeys.home(scope) });
      void client.invalidateQueries({ queryKey: queryKeys.productLists(scope) });
      void client.invalidateQueries({ queryKey: queryKeys.orderCreationProductLists(scope) });
      for (const line of result?.order.lines ?? []) {
        void client.invalidateQueries({ queryKey: queryKeys.productStock(scope, line.productId) });
        void client.invalidateQueries({ queryKey: queryKeys.product(scope, line.productId) });
        void client.invalidateQueries({ queryKey: queryKeys.productEditor(scope, line.productId) });
      }
    }
  );
}
export function useCreateOrderContact(draftId: string) {
  const client = useQueryClient();
  return useCreationWrite<OrderContactCreateRequest, OrderContactCreateResult>(
    'contact',
    draftId,
    createOrderContact,
    async (scope, operation, request, signal) => {
      const id = operation.resources.find((resource) => resource.kind === 'customer')?.id;
      if (!id || !request) return;
      let cursor: string | undefined;
      do {
        const page = await getOrderCreationCustomers(
          scope,
          { search: request.email, cursor },
          signal
        );
        const customer = page.items.find((item) => item.id === id);
        if (customer) return { operation, customer };
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    },
    async (scope, operation, _result, isCurrent) => {
      if (!isCurrent()) throw new CreationScopeChanged();
      client.setQueryData(queryKeys.operation(scope, operation.key), operation);
      void client.invalidateQueries({ queryKey: queryKeys.orderCreationCustomerLists(scope) });
    }
  );
}
