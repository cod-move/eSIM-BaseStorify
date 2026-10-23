import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { WORKSPACE_QUERIES } from '@/api/query-keys';
import { retainWorkspaceReplyDrafts } from '@/features/inbox/reply-drafts';
import { retainProductDrafts } from '@/features/products/editor/drafts';
import { retainCreationDrafts } from '@/features/orders/creation/draft';
import { retainReturnDrafts } from '@/features/returns/store';

import { useWorkspace } from './use-workspace';

/**
 * Throws away everything cached from any workspace but the current one
 * (orders, products, messages, figures), and stops what is still on its way,
 * whenever the workspace changes: the operator switched, or GET /me no longer
 * lists the one they were in. Every workspace answer is kept under its
 * workspace, so nothing of the other one can show meanwhile; this frees it.
 *
 * Mounted once, in the root layout, after the screens: a layout's effects run
 * after its screens', so by then they have moved to the new workspace's
 * queries and the old ones are unused. (Removing a query a screen still
 * watches would leave it outside the cache with its timers running.)
 */
export function useWorkspaceSync(): void {
  const state = useWorkspace();
  const workspace = state.status === 'ready' ? state.workspace : null;
  const canReadInbox = state.status === 'ready' && state.access.capabilities.includes('VIEW_INBOX');
  const canEditProducts =
    state.status === 'ready' && state.access.capabilities.includes('EDIT_PRODUCTS');
  const canCreateProducts =
    state.status === 'ready' && state.access.capabilities.includes('CREATE_PRODUCTS');
  const canCreateOrders =
    state.status === 'ready' && state.access.capabilities.includes('CREATE_ORDERS');
  const queryClient = useQueryClient();
  const canReturns =
    state.status === 'ready' && state.access.capabilities.includes('HANDLE_RETURNS');
  const canRefunds =
    state.status === 'ready' && state.access.capabilities.includes('ISSUE_REFUNDS');

  useEffect(() => {
    retainWorkspaceReplyDrafts(workspace, canReadInbox);
    retainProductDrafts(workspace, canEditProducts, canCreateProducts);
    retainCreationDrafts(workspace, canCreateOrders);
    retainReturnDrafts(workspace, [
      ...(canReturns ? ['HANDLE_RETURNS' as const] : []),
      ...(canRefunds ? ['ISSUE_REFUNDS' as const] : []),
    ]);
    const filters = {
      queryKey: WORKSPACE_QUERIES,
      predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[2] !== workspace,
    };
    void queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  }, [
    workspace,
    canReadInbox,
    canEditProducts,
    canCreateProducts,
    canCreateOrders,
    canReturns,
    canRefunds,
    queryClient,
  ]);
}
