import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { markNotificationsRead } from '@/api/endpoints/notifications';
import { useWorkspaceStore } from '@/features/workspace/workspace-store';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import './hooks';
import './preload-app';
import {
  currentPath,
  openApp,
  openTab,
  press,
  settle,
  signInOnScreen,
  tabNames,
  tap,
} from './screens';

type Permission = Awaited<ReturnType<typeof getPermissionsAsync>>;

async function openNotifications(email = 'admin@example.com'): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await act(async () => router.push('/more/notifications'));
  await settle();
  await screen.findByRole('header', { name: 'Notifications' });
}

/** A row of the list, by its title (its name is "Unread, <title>, …" while unread). */
function row(title: string) {
  return screen.getByRole('button', { name: new RegExp(`^(Unread, )?${title},`) });
}

function isUnread(title: string): boolean {
  return String(row(title).props.accessibilityLabel).startsWith('Unread, ');
}

afterEach(() => {
  jest
    .mocked(getPermissionsAsync)
    .mockImplementation(async () => ({ granted: false }) as Permission);
});

/** The notifications: the dashboard bell's, in the app. */
describe('notifications', () => {
  it('lists them by day, the newest first, the unread ones marked', async () => {
    await openNotifications();

    expect(isUnread('New order #1042')).toBe(true);
    expect(isUnread('New message')).toBe(true);
    expect(isUnread('New Vendor Application Pending')).toBe(true);
    expect(isUnread('Order #1031 delivered')).toBe(false);
    // Three from the last few hours, then two from two and three days back.
    expect(screen.getByRole('header', { name: 'Last 7 days' })).toBeVisible();

    await tap(screen.getByRole('tab', { name: 'Unread, 3' }));
    await settle();
    expect(screen.queryByRole('button', { name: /^Order #1031 delivered,/ })).toBeNull();
    expect(row('New message')).toBeVisible();
  });

  it('reads the list again on coming back to it', async () => {
    await openNotifications();
    expect(isUnread('New order #1042')).toBe(true);

    await act(async () => router.push('/more/account'));
    await settle();
    // Read meanwhile on the website's bell.
    await act(async () => {
      await markNotificationsRead('en', { all: true });
    });
    await act(async () => router.back());
    await settle();

    expect(isUnread('New order #1042')).toBe(false);
    expect(isUnread('New message')).toBe(false);
  });

  it('opens an application, and marks it read', async () => {
    await openNotifications();

    await tap(row('New Vendor Application Pending'));
    await settle();
    expect(await screen.findByRole('header', { name: 'Sunrise Bakery' })).toBeVisible();

    await act(async () => router.back());
    await settle();
    expect(isUnread('New Vendor Application Pending')).toBe(false);
  });

  it('opens a message’s conversation, and an order', async () => {
    await openNotifications();

    await tap(row('New message'));
    await settle();
    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();

    await act(async () => router.back());
    await settle();
    await tap(row('New order #1042'));
    await settle();
    expect(currentPath()).toBe('/orders/ord_1042');
  });

  it('opens a seller’s low-stock alert as the low-stock list, and a payout', async () => {
    await openNotifications('seller@example.com');

    await tap(row('Low Stock Alert'));
    await settle();
    expect(currentPath()).toBe('/products');
    expect(await screen.findByRole('button', { name: 'Remove filter: Low stock' })).toBeVisible();

    await act(async () => router.push('/more/notifications'));
    await settle();
    await tap(row('Payout sent'));
    await settle();
    expect(await screen.findByRole('header', { name: 'PO-2026-0007' })).toBeVisible();
  });

  it('opens a return notification in the native return queue', async () => {
    await openNotifications();

    await tap(row('Return requested'));
    await settle();
    expect(currentPath()).toBe('/returns');
  });

  it('opens one about the other workspace there, after saying so', async () => {
    useWorkspaceStore.setState({ choice: { userId: 'user_both', workspace: 'platform' } });
    await openNotifications('both@example.com');

    await tap(row('Low Stock Alert'));
    await settle();

    expect(await screen.findByText('Now working in Green Leaf Goods')).toBeOnTheScreen();
    expect(currentPath()).toBe('/products');
  });

  it('closes the other workspace’s screens when it switches', async () => {
    useWorkspaceStore.setState({ choice: { userId: 'user_both', workspace: 'platform' } });
    await openApp();
    await signInOnScreen('both@example.com');
    await screen.findByRole('tab', { name: 'Home' });
    await act(async () => router.push('/conversations/conv_store_1'));
    await screen.findByRole('header', { name: 'Rina Begum' });
    await act(async () => router.push('/more/notifications'));
    await settle();

    await tap(screen.getByRole('button', { name: /New order #1042, You have a new order/ }));
    await settle();

    expect(currentPath()).toBe('/orders/ord_1042');
    // Back is Home: the store's conversation would be asked again as Green Leaf's, and not found.
    await act(async () => router.back());
    await settle();
    expect(currentPath()).toBe('/');
  });

  it('marks all read: the list and the Account tab’s dot follow', async () => {
    await openApp();
    await signInOnScreen('admin@example.com');
    await screen.findByRole('tab', { name: 'Home' });
    expect(tabNames()).toContain('Account, something new');
    await openTab('Account');
    await press('Notifications');
    await settle();

    await press('Mark all as read');
    await settle();

    expect(isUnread('New order #1042')).toBe(false);
    expect(isUnread('New message')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
    await act(async () => router.back());
    await settle();
    expect(tabNames()).toContain('Account');
  });

  it('says so when marking all read offline, and sends nothing', async () => {
    await openNotifications();

    await act(async () => onlineManager.setOnline(false));
    try {
      await press('Mark all as read');
      expect(await screen.findByText("You're offline. Nothing was sent.")).toBeVisible();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
    expect(isUnread('New order #1042')).toBe(true);
  });
});

describe('push turned off on this phone', () => {
  beforeEach(() => {
    // The one-time push moment has been and gone: only the banner speaks here.
    localStorage.setItem(STORAGE_KEYS.pushAsked, '1');
  });

  it('offers to turn it on while the phone can still ask', async () => {
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(
        async () => ({ granted: false, status: 'undetermined', canAskAgain: true }) as Permission
      );
    await openNotifications();

    expect(
      await screen.findByText(
        'Turn on notifications to hear about new orders and messages on this phone.'
      )
    ).toBeVisible();
    await tap(screen.getByRole('link', { name: 'Turn on' }));
    expect(requestPermissionsAsync).toHaveBeenCalled();
  });

  it('opens the phone’s settings once the phone has refused', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(
        async () => ({ granted: false, status: 'denied', canAskAgain: false }) as Permission
      );
    await openNotifications();

    expect(
      await screen.findByText(
        "Notifications are off for this app. Turn them on in your phone's settings."
      )
    ).toBeVisible();
    await tap(screen.getByRole('link', { name: 'Open settings' }));
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });
});
