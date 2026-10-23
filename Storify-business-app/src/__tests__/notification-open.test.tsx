import { act, screen } from '@testing-library/react-native';
import { useLastNotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';

import { getMe } from '@/api/endpoints/me';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { Me } from '@/contracts/mobile/biz/v1';

import { signInAs } from './hooks';
import './preload-app';
import { currentPath, openApp, settle, signInOnScreen, tap } from './screens';

/** A tapped push of the store's: the dashboard link in `data.url`, and its type. */
function tapped(url: string, type?: string) {
  jest.mocked(useLastNotificationResponse).mockReturnValue({
    notification: {
      request: { identifier: `push-${url}`, content: { data: { url, type } } },
    },
  } as unknown as ReturnType<typeof useLastNotificationResponse>);
}

/**
 * A tapped notification opens its screen once the workspace is open, the
 * notification that started the app included.
 */
describe('opening a tapped notification', () => {
  it('opens a native return from a cold-start notification after sign-in', async () => {
    tapped('/en/admin/returns/ret_store_1', 'return_requested');
    await openApp();
    await signInOnScreen('admin@example.com');
    expect(await screen.findByRole('header', { name: 'Return R1001' })).toBeVisible();
    expect(currentPath()).toBe('/returns/ret_store_1');
  });
  it('falls back safely when a cold return notification lacks its capability', async () => {
    tapped('/en/admin/returns/ret_store_1', 'return_requested');
    await openApp();
    await signInOnScreen('staff@example.com');
    expect(await screen.findByText('Staff')).toBeVisible();
    expect(currentPath()).toBe('/');
  });
  it('opens the order it is about, after signing in', async () => {
    tapped('/en/admin/orders/ord_1', 'order_status');
    await openApp();
    await signInOnScreen('admin@example.com');

    expect(await screen.findByRole('header', { name: 'Order' })).toBeVisible();
  });

  it('switches to the workspace the link is about, then opens it', async () => {
    tapped('/en/vendor/orders/ord_1', 'order_status');
    jest.requireActual('@/features/workspace/workspace-store').useWorkspaceStore.setState({
      choice: { userId: 'user_both', workspace: 'platform' },
    });
    await openApp();
    await signInOnScreen('both@example.com');

    expect(await screen.findByText('Now working in Green Leaf Goods')).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'Order' })).toBeVisible();
  });

  it('opens Home instead of a screen the operator may not see', async () => {
    tapped('/en/admin/vendors/v1', 'vendor_application');
    await openApp();
    await signInOnScreen('staff@example.com');

    expect(await screen.findByText('Staff')).toBeVisible();
    expect(screen.queryByRole('header', { name: 'Seller application' })).toBeNull();
  });

  it('waits for GET /me of this start, not the copy kept on the device', async () => {
    await signInAs('admin@example.com');
    let me: Me | undefined;
    await act(async () => {
      me = await getMe('en', new AbortController().signal);
    });
    // Kept from an earlier start, when the operator could not see orders yet.
    const kept: Me = {
      ...me!,
      workspaces: me!.workspaces.map((access) => ({
        ...access,
        capabilities: access.capabilities.filter((capability) => capability !== 'VIEW_ORDERS'),
      })),
    };
    queryClient.setQueryData(queryKeys.me('en'), kept, { updatedAt: 1 });
    tapped('/en/admin/orders/ord_1', 'order_status');

    await openApp();

    expect(await screen.findByRole('header', { name: 'Order' })).toBeVisible();
    expect(currentPath()).toBe('/orders/ord_1');
  });
});

describe('a notification row that opens a tab', () => {
  it('goes back to the tabs, instead of stacking a second set over the notifications', async () => {
    await openApp();
    await signInOnScreen('seller@example.com');
    await screen.findByRole('tab', { name: 'Home' });
    await settle();
    await act(async () => router.push('/more/notifications'));
    await settle();
    await screen.findByRole('header', { name: 'Notifications' });

    await tap(screen.getByRole('button', { name: /Low Stock Alert/ }));
    await settle();

    expect(currentPath()).toBe('/products');
    expect(router.canDismiss()).toBe(false);
  });
});
