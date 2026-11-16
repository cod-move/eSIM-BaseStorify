import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { etagPages, etagQuery, nextCursor, selectData } from '@/api/etag-query';
import { useKeyedMutation } from '@/api/keyed-mutation';
import { inWorkspace } from '@/api/query-keys/shared';
import type { WorkspaceScope } from '@/api/scope';
import type {
  CustomerEmailRequest,
  EsimActionRequest,
  EsimList,
  NumberList,
  NumberStatusFilter,
  ProblemActionRequest,
  ProblemList,
  ProblemView,
  TopupList,
  TopupView,
} from '@/contracts/mobile/biz/v1/esim';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

import {
  getCustomerEmails,
  getCustomerEsims,
  getEsim,
  getEsimAccess,
  getEsimStatus,
  getEsims,
  getNumbers,
  getProblems,
  getTopups,
  postCustomerEmail,
  postEsimAction,
  postProblemAction,
  postRunJob,
} from './api';

/** The eSIM area's cache keys, under the workspace's like every other area's. */
export const esimKeys = {
  all: (scope: WorkspaceScope | null) => inWorkspace(scope, 'esim'),
  access: (scope: WorkspaceScope | null) => [...inWorkspace(scope, 'esim'), 'access'] as const,
  esims: (scope: WorkspaceScope | null, filter: object) =>
    [...inWorkspace(scope, 'esim'), 'esims', scope?.locale, filter] as const,
  esim: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'esim'), 'esim', id, scope?.locale] as const,
  problems: (scope: WorkspaceScope | null, filter: object) =>
    [...inWorkspace(scope, 'esim'), 'problems', scope?.locale, filter] as const,
  status: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'esim'), 'status', scope?.locale] as const,
  topups: (scope: WorkspaceScope | null, filter: object) =>
    [...inWorkspace(scope, 'esim'), 'topups', scope?.locale, filter] as const,
  numbers: (scope: WorkspaceScope | null, filter: object) =>
    [...inWorkspace(scope, 'esim'), 'numbers', scope?.locale, filter] as const,
  customerEsims: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'esim'), 'customer-esims', id, scope?.locale] as const,
  customerEmails: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'esim'), 'customer-emails', id, scope?.locale] as const,
};

/**
 * What the operator may do in the eSIM area. Only the store's own workspace
 * has one; a seller, the store's staff and an administrator without the eSIM
 * permissions get `view: false` (or a refusal), and the app shows nothing.
 */
export function useEsimAccess() {
  const scope = useWorkspaceScope();
  const platform = scope?.workspace === 'platform';
  const query = useQuery({
    queryKey: esimKeys.access(scope),
    queryFn: scope && platform ? etagQuery((options) => getEsimAccess(scope, options)) : skipToken,
    select: selectData,
    retry: false,
    staleTime: 5 * 60_000,
  });
  return { view: query.data?.view ?? false, manage: query.data?.manage ?? false, query };
}

const term = (search: string) => {
  const value = search.trim().slice(0, 100);
  return value || undefined;
};

/** Every issued eSIM, newest first, by ICCID, order number or email, and lifecycle. */
export function useEsims(search: string, lifecycle: string) {
  const scope = useWorkspaceScope();
  const filter = { search: term(search), lifecycle: lifecycle || undefined };
  return useInfiniteQuery({
    queryKey: esimKeys.esims(scope, filter),
    queryFn: scope
      ? etagPages<EsimList>((cursor, options) => getEsims(scope, { ...filter, cursor }, options))
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.data.items),
      total: data.pages[0]?.data.total ?? 0,
    }),
  });
}

export function useEsim(id: string) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: esimKeys.esim(scope, id),
    queryFn: scope && id ? etagQuery((options) => getEsim(scope, id, options)) : skipToken,
    select: selectData,
  });
}

/** Refresh usage, resend the delivery email, cancel at the supplier: once per tap. */
export function useEsimAction(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  return useKeyedMutation({
    attemptKey: (request: EsimActionRequest) => [
      'esim-action',
      scope?.workspace,
      id,
      request.action,
    ],
    send: (request: EsimActionRequest, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return postEsimAction(scope, id, request, idempotencyKey);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: esimKeys.all(scope) });
    },
  });
}

export function useProblems(view: ProblemView, search: string) {
  const scope = useWorkspaceScope();
  const filter = { view, search: term(search) };
  return useInfiniteQuery({
    queryKey: esimKeys.problems(scope, filter),
    queryFn: scope
      ? etagPages<ProblemList>((cursor, options) =>
          getProblems(scope, { ...filter, cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.data.items),
      counts: data.pages[0]?.data.counts,
    }),
  });
}

/** Retry, switch supplier, give up, record a refund, approve or reject: once per tap. */
export function useProblemAction(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  return useKeyedMutation({
    attemptKey: (request: ProblemActionRequest) => [
      'esim-problem',
      scope?.workspace,
      id,
      request.action,
    ],
    send: (request: ProblemActionRequest, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return postProblemAction(scope, id, request, idempotencyKey);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: esimKeys.all(scope) });
    },
  });
}

export function useEsimStatus() {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: esimKeys.status(scope),
    queryFn: scope ? etagQuery((options) => getEsimStatus(scope, options)) : skipToken,
    select: selectData,
  });
}

/** Runs a scheduled job now; the status is read again a little later, when it has had time to run. */
export function useRunJob() {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (job: string) => {
      if (!scope) throw new Error('No workspace yet');
      return postRunJob(scope, job);
    },
    onSuccess: () => {
      setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: esimKeys.status(scope) }),
        5000
      );
    },
  });
}

export function useTopups(view: TopupView, search: string) {
  const scope = useWorkspaceScope();
  const filter = { view, search: term(search) };
  return useInfiniteQuery({
    queryKey: esimKeys.topups(scope, filter),
    queryFn: scope
      ? etagPages<TopupList>((cursor, options) => getTopups(scope, { ...filter, cursor }, options))
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.data.items),
      counts: data.pages[0]?.data.counts,
    }),
  });
}

export function useNumbers(status: NumberStatusFilter, search: string) {
  const scope = useWorkspaceScope();
  const filter = { status, search: term(search) };
  return useInfiniteQuery({
    queryKey: esimKeys.numbers(scope, filter),
    queryFn: scope
      ? etagPages<NumberList>((cursor, options) =>
          getNumbers(scope, { ...filter, cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.data.items),
      counts: data.pages[0]?.data.counts,
    }),
  });
}

/** One customer's eSIMs and number cards; only asked for when the operator may see eSIMs. */
export function useCustomerEsims(customerId: string, enabled: boolean) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: esimKeys.customerEsims(scope, customerId),
    queryFn:
      scope && customerId && enabled
        ? etagQuery((options) => getCustomerEsims(scope, customerId, options))
        : skipToken,
    select: selectData,
  });
}

export function useCustomerEmails(customerId: string, enabled: boolean) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: esimKeys.customerEmails(scope, customerId),
    queryFn:
      scope && customerId && enabled
        ? etagQuery((options) => getCustomerEmails(scope, customerId, options))
        : skipToken,
    select: selectData,
  });
}

/** Sends an email to the customer: one key per tap, so "Try again" never sends it twice. */
export function useSendCustomerEmail(customerId: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  return useKeyedMutation({
    attemptKey: () => ['esim-customer-email', scope?.workspace, customerId],
    send: (request: CustomerEmailRequest, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return postCustomerEmail(scope, customerId, request, idempotencyKey);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: esimKeys.customerEmails(scope, customerId) });
    },
  });
}
