import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { queryClient } from '@/api/query-client';
import { WORKSPACE_QUERIES } from '@/api/query-keys';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import './hooks';
import './preload-app';
import { currentPath, openApp, openTab, press, settle, signInOnScreen, tap } from './screens';

/** The workspaces whose data is in the cache now. */
const cachedWorkspaces = () => [
  ...new Set(
    queryClient
      .getQueryCache()
      .findAll({ queryKey: WORKSPACE_QUERIES })
      .map((query) => query.queryKey[2])
  ),
];

/**
 * Choosing where to work, and switching, on screen: an
 * operator with two workspaces is asked once, the choice is remembered, and a
 * switch throws away the other workspace's data and returns to Home.
 */
describe('the workspace on screen', () => {
  it('asks an operator with two where to work, and opens the one chosen', async () => {
    await openApp();
    await signInOnScreen('both@example.com');

    expect(await screen.findByText('Where do you want to work?')).toBeVisible();
    // Nothing of a workspace is asked for before there is one.
    expect(cachedWorkspaces()).toEqual([]);

    await press('Green Leaf Goods, Staff, Limited to some sellers or locations');
    await settle();

    expect(await screen.findByRole('button', { name: 'Green Leaf Goods, Staff' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.workspace) ?? 'null')).toEqual({
      userId: 'user_both',
      workspace: 'vendor',
    });
  });

  it('switches from Home, throws the other workspace away, and says so', async () => {
    await openApp();
    await signInOnScreen('both@example.com');
    await press('Green Leaf Goods, Staff, Limited to some sellers or locations');
    await settle();
    await screen.findByRole('button', { name: 'Green Leaf Goods, Staff' });
    await settle();
    expect(cachedWorkspaces()).toEqual(['vendor']);

    await press('Green Leaf Goods, Staff');
    await settle();
    // The sheet, still rising.
    expect(await screen.findByText('Workspace')).toBeOnTheScreen();
    const stores = screen.getAllByRole('radio', { name: 'Storify Demo Store' });
    await tap(stores[stores.length - 1]!);
    await settle();

    expect(await screen.findByText('Now working in Storify Demo Store')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Storify Demo Store, Staff' })).toBeVisible();
    await settle();
    expect(cachedWorkspaces()).not.toContain('vendor');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.workspace) ?? 'null')).toMatchObject({
      workspace: 'platform',
    });
  });

  it('opens the remembered workspace next time, without asking', async () => {
    localStorage.setItem(
      STORAGE_KEYS.workspace,
      JSON.stringify({ userId: 'user_both', workspace: 'vendor' })
    );
    const { useWorkspaceStore } = jest.requireActual('@/features/workspace/workspace-store');
    useWorkspaceStore.setState({ choice: { userId: 'user_both', workspace: 'vendor' } });

    await openApp();
    await signInOnScreen('both@example.com');

    expect(await screen.findByRole('button', { name: 'Green Leaf Goods, Staff' })).toBeVisible();
    expect(screen.queryByText('Where do you want to work?')).toBeNull();
  });

  it('switches from Account too', async () => {
    await openApp();
    await signInOnScreen('both@example.com');
    await press('Storify Demo Store, Staff');
    await settle();
    await screen.findByRole('button', { name: 'Storify Demo Store, Staff' });

    await openTab('Account');
    await press('Storify Demo Store, Switch');
    const sellers = await screen.findAllByRole('radio', { name: 'Green Leaf Goods' });
    await tap(sellers[sellers.length - 1]!);
    await settle();

    expect(await screen.findByText('Now working in Green Leaf Goods')).toBeVisible();
    // Back on Home, with nothing above the tabs.
    expect(currentPath()).toBe('/');
    expect(router.canDismiss()).toBe(false);
  });

  it('switches for a notification about the other workspace, closing the old one’s screens', async () => {
    await openApp();
    await signInOnScreen('both@example.com');
    await press('Storify Demo Store, Staff');
    await settle();
    await screen.findByRole('tab', { name: 'Home' });
    // An order of the store’s, then the notifications, above the tabs.
    await act(async () => router.push('/orders/ord_1042'));
    await settle();
    await act(async () => router.push('/more/notifications'));
    await settle();
    await screen.findByRole('header', { name: 'Notifications' });

    // About Green Leaf Goods’ part of an order.
    await tap(screen.getByRole('button', { name: /You have a new order to fulfil/ }));
    await settle();
    await settle();

    expect(await screen.findByText('Now working in Green Leaf Goods')).toBeOnTheScreen();
    expect(currentPath()).toBe('/orders/ord_1042');
    // Only the tabs lie under it: the store’s order and the notifications are closed.
    await act(async () => router.back());
    await settle();
    expect(currentPath()).toBe('/');
    expect(router.canDismiss()).toBe(false);
  });
});
