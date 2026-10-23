import { skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getCustomer,
  getCustomerNotes,
  getCustomers,
  postCustomerNote,
} from '@/api/endpoints/customers';
import { etagPages, etagQuery, nextCursor, selectData, type CachedPages } from '@/api/etag-query';
import { useKeyedMutation } from '@/api/keyed-mutation';
import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import type { CustomerList, CustomerNote, CustomerNoteList } from '@/contracts/mobile/biz/v1';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';

/**
 * The operator's customers (GET /customers), newest first, a page at a time,
 * found by part of a name, email or phone. Who is whose is the store's: every
 * customer for the store's operators, the customers of their orders (and the
 * accounts that wrote to them) for a seller. Each page is revalidated with its
 * ETag.
 */
export function useCustomers(search: string) {
  const scope = useWorkspaceScope();
  const term = search.trim().slice(0, 100);
  const filter = term ? { search: term } : {};

  return useInfiniteQuery({
    queryKey: queryKeys.customerList(scope, filter),
    queryFn: scope
      ? etagPages<CustomerList>((cursor, options) =>
          getCustomers(scope, { ...filter, cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data.items),
  });
}

/**
 * One customer: contact, addresses, and the store's figures from the orders
 * the operator sees (`summary`; money as the store wrote it). One out of
 * reach is a 404.
 */
export function useCustomer(id: string) {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.customer(scope, id),
    queryFn: scope && id ? etagQuery((options) => getCustomer(scope, id, options)) : skipToken,
    select: selectData,
  });
}

/**
 * Reads the customer again with everything their profile shows: their figures,
 * their orders and conversations, the notes. For pull to refresh.
 */
export function useRefreshCustomer(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all(
      [
        queryKeys.customer(scope, id),
        queryKeys.customerNotes(scope, id),
        queryKeys.orderLists(scope),
        queryKeys.conversationLists(scope),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    );
  };
}

/**
 * The business's notes about a customer, newest first: the store's team's in
 * the store's workspace, the seller's in theirs. Only asked for with
 * `MANAGE_CUSTOMER_NOTES`; `enabled` says whether they are.
 */
export function useCustomerNotes(id: string) {
  const scope = useWorkspaceScope();
  const enabled = useCan('MANAGE_CUSTOMER_NOTES');

  const query = useInfiniteQuery({
    queryKey: queryKeys.customerNotes(scope, id),
    queryFn:
      scope && id && enabled
        ? etagPages<CustomerNoteList>((cursor, options) =>
            getCustomerNotes(scope, id, { cursor }, options)
          )
        : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data.items),
  });
  return { ...query, enabled };
}

/**
 * Writes a note about a customer: one `Idempotency-Key` per tap, kept for its
 * retries and, while it has no answer, for the next tap of the same note, so
 * "Try again" never writes it twice. Nothing goes out offline.
 *
 * The note the store answered goes on top of the list at once, and the list
 * is read again behind it.
 */
export function useAddCustomerNote(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useKeyedMutation({
    attemptKey: () => ['customer-note', scope?.workspace, id],
    send: ({ body }: { body: string }, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return postCustomerNote(scope, id, { body }, idempotencyKey);
    },
    // The workspace the note goes out from: an answer never lands in another's notes.
    onMutate: () => scope,
    onSuccess: (note: CustomerNote, _request, from) => {
      showNote(queryClient, from ?? null, id, note);
    },
    onSettled: (_note, _error, _request, from) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerNotes(from ?? null, id) });
    },
  });
}

/** Puts the store's answer at the top of the notes already shown. */
function showNote(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: WorkspaceScope | null,
  id: string,
  note: CustomerNote
) {
  queryClient.setQueryData<CachedPages<CustomerNoteList>>(
    queryKeys.customerNotes(scope, id),
    (cached) => {
      const [first, ...rest] = cached?.pages ?? [];
      if (!cached || !first || first.data.items.some((item) => item.id === note.id)) return cached;
      const page = { ...first, data: { ...first.data, items: [note, ...first.data.items] } };
      return { ...cached, pages: [page, ...rest] };
    }
  );
}
