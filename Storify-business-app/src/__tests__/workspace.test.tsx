import { act, waitFor } from '@testing-library/react-native';

import { queryClient } from '@/api/query-client';
import { WORKSPACE_QUERIES } from '@/api/query-keys';
import { useConfig } from '@/features/config/use-config';
import { useOrders } from '@/features/orders/use-orders';
import { useCan, useWorkspace } from '@/features/workspace/use-workspace';
import { useWorkspaceLabel } from '@/features/workspace/workspace-label';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { renderAppHook, signInAs } from './hooks';

/** The workspace, what the operator may do in it, and the orders they see there. */
function useScreen() {
  return {
    workspace: useWorkspace(),
    canPay: useCan('VIEW_PAYOUTS'),
    canReview: useCan('REVIEW_VENDOR_APPLICATIONS'),
    orders: useOrders(),
  };
}

const workspaceKeys = () =>
  queryClient
    .getQueryCache()
    .findAll({ queryKey: WORKSPACE_QUERIES })
    .map((query) => query.queryKey[2]);

describe('the workspace', () => {
  it('opens the only workspace at once, with its capabilities', async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(useScreen);

    await waitFor(() => expect(result.current.workspace.status).toBe('ready'));
    expect(result.current).toMatchObject({
      workspace: { workspace: 'platform' },
      canReview: true,
      canPay: false,
    });
    await waitFor(() => expect(result.current.orders.data).toBeDefined());
  });

  it('asks which of two, asks nothing before, and remembers the choice', async () => {
    await signInAs('both@example.com');
    const { result } = await renderAppHook(useScreen);

    await waitFor(() => expect(result.current.workspace.status).toBe('choose'));
    // Nothing of a workspace is asked for while there is none.
    expect(result.current.orders.fetchStatus).toBe('idle');

    await act(async () => result.current.workspace.chooseWorkspace('vendor'));

    await waitFor(() => expect(result.current.orders.data).toBeDefined());
    expect(result.current.workspace).toMatchObject({ status: 'ready', workspace: 'vendor' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.workspace) ?? 'null')).toEqual({
      userId: 'user_both',
      workspace: 'vendor',
    });
  });

  it("throws away the other workspace's data on a switch", async () => {
    await signInAs('both@example.com');
    const { result } = await renderAppHook(useScreen);
    await waitFor(() => expect(result.current.workspace.status).toBe('choose'));

    await act(async () => result.current.workspace.chooseWorkspace('vendor'));
    await waitFor(() => expect(result.current.orders.data).toBeDefined());
    // A seller's staff see only the orders wholly their seller's.
    expect(result.current.orders.data?.map((order) => order.number)).not.toContain('1029');
    expect(workspaceKeys()).toEqual(['vendor']);

    await act(async () => result.current.workspace.chooseWorkspace('platform'));
    await waitFor(() =>
      expect(result.current.orders.data?.map((order) => order.number)).toContain('1029')
    );
    expect(workspaceKeys()).toEqual(['platform']);
  });

  it("pictures the store's workspace by its square icon, not its wide logo", async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(useNamedWorkspace);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.logo?.thumb).toContain('/storify-icon/');
  });

  it("pictures a seller's workspace by the seller's logo", async () => {
    await signInAs('seller@example.com');
    const { result } = await renderAppHook(useNamedWorkspace);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.logo?.thumb).toContain('/logo-');
  });
});

/** How the open workspace is named on screen, once the store's settings are known. */
function useNamedWorkspace() {
  const workspace = useWorkspace();
  const label = useWorkspaceLabel();
  const config = useConfig();
  return workspace.status === 'ready' && config.data ? label(workspace.access) : null;
}
