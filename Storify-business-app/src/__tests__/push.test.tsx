import { act, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';
import {
  addNotificationReceivedListener,
  clearLastNotificationResponseAsync,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationHandler,
  useLastNotificationResponse,
  type Notification,
  type NotificationHandler,
} from 'expo-notifications';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import { registeredDevices } from '@/api/mocks/routes/devices';
import { receiveMockMessage } from '@/api/mocks/routes/inbox';
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
  wait,
} from './screens';

type Permission = Awaited<ReturnType<typeof getPermissionsAsync>>;

const PROJECT = 'business-app-project';
const config = Constants.expoConfig as { extra?: Record<string, unknown> };

function permission(answer: Partial<Permission> & { granted: boolean }) {
  jest.mocked(getPermissionsAsync).mockImplementation(async () => answer as Permission);
}

/** A push of the store's: `data` as it sends it (contract: devices.ts). */
function push(url: string, type?: string, notificationId?: string): Notification {
  return {
    date: Date.now(),
    request: {
      identifier: `push-${url}-${notificationId ?? ''}`,
      content: { title: 'Storify', body: '', data: { url, type, notificationId } },
      trigger: null,
    },
  } as unknown as Notification;
}

/** The operator taps a push (the one that opened the app, or one that came while it was open). */
function tapped(url: string, type?: string, notificationId?: string) {
  jest.mocked(useLastNotificationResponse).mockReturnValue({
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: push(url, type, notificationId),
  } as unknown as ReturnType<typeof useLastNotificationResponse>);
}

async function signIn(email: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await settle();
}

/** Signs in with a tapped push waiting: the app goes on to its screen, above the tabs. */
async function signInTapped(email: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await settle();
}

beforeEach(() => {
  config.extra = { eas: { projectId: PROJECT } };
});

afterEach(() => {
  delete config.extra;
  jest
    .mocked(getPermissionsAsync)
    .mockImplementation(async () => ({ granted: false }) as Permission);
  jest.mocked(useLastNotificationResponse).mockReturnValue(null);
});

/** Registering this phone (contract: devices.ts): after sign-in, removed before sign-out. */
describe('this phone’s push token', () => {
  it('is registered with the business app’s project after sign-in, and removed on sign-out', async () => {
    permission({ granted: true, status: 'granted' as Permission['status'] });
    await signIn('admin@example.com');

    expect(getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: PROJECT });
    expect(registeredDevices()).toEqual(['ExponentPushToken[test]']);

    await act(async () => router.push('/more/account'));
    await settle();
    await press('Sign out');
    await press('Sign out');
    await settle();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(registeredDevices()).toEqual([]);
  });

  it('is not registered by a build without the business app’s EAS project', async () => {
    delete config.extra;
    permission({ granted: true, status: 'granted' as Permission['status'] });
    await signIn('admin@example.com');

    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(registeredDevices()).toEqual([]);
  });

  it('is not asked for while notifications are not allowed', async () => {
    await signIn('admin@example.com');

    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(registeredDevices()).toEqual([]);
  });

  it('is registered when the operator allows notifications in the phone’s settings and comes back', async () => {
    await signIn('admin@example.com');
    expect(registeredDevices()).toEqual([]);

    // Turned on in the phone's settings, away from the app; then the app is in front again.
    permission({ granted: true, status: 'granted' as Permission['status'] });
    const listeners = jest
      .mocked(AppState.addEventListener)
      .mock.calls.filter(([event]) => event === 'change')
      .map(([, listener]) => listener);
    await act(async () => {
      listeners.forEach((listener) => listener('active'));
    });
    await settle();

    expect(getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: PROJECT });
    expect(registeredDevices()).toEqual(['ExponentPushToken[test]']);
  });
});

/** The push moment: once, saying why, before the phone asks. */
describe('asking for push', () => {
  it('says why once the tabs are open, then lets the phone ask', async () => {
    permission({
      granted: false,
      status: 'undetermined' as Permission['status'],
      canAskAgain: true,
    });
    await signIn('admin@example.com');
    await wait(1300);

    expect(await screen.findByText('Stay on top of the store')).toBeOnTheScreen();
    expect(localStorage.getItem(STORAGE_KEYS.pushAsked)).toBe('1');

    await press('Turn on notifications');
    await settle();
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('takes "Not now" for an answer, and does not ask again by itself', async () => {
    permission({
      granted: false,
      status: 'undetermined' as Permission['status'],
      canAskAgain: true,
    });
    await signIn('admin@example.com');
    await wait(1300);

    await press('Not now');
    await settle();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.pushAsked)).toBe('1');
  });

  it('does not ask when notifications are allowed already', async () => {
    permission({ granted: true, status: 'granted' as Permission['status'] });
    await signIn('admin@example.com');
    await wait(1300);

    expect(screen.queryByText('Stay on top of the store')).toBeNull();
  });
});

/** A push that arrives while the app is open. */
describe('a push that arrives', () => {
  it('reads the inbox again at once: the badge and the list follow', async () => {
    await signIn('admin@example.com');
    await openTab('Inbox');
    await settle();
    expect(tabNames()).toContain('Inbox, 2 unread');

    receiveMockMessage('conv_store_1', 'Can it ship today?');
    // expo-notifications hands an arriving push to every listener.
    await act(async () => {
      for (const [listener] of jest.mocked(addNotificationReceivedListener).mock.calls) {
        listener(push('/en/admin/inbox?view=chat&conversation=conv_store_1', 'chat_message'));
      }
    });
    await settle();

    expect(await screen.findByText('Can it ship today?')).toBeVisible();
    expect(tabNames()).toContain('Inbox, 3 unread');
  });

  it('shows as a banner, unless it is a message of the thread on screen', async () => {
    await signIn('admin@example.com');
    await act(async () =>
      router.push({ pathname: '/conversations/[id]', params: { id: 'conv_store_1' } })
    );
    await settle();
    const handler = jest
      .mocked(setNotificationHandler)
      .mock.calls.at(-1)?.[0] as NotificationHandler;

    const here = await handler.handleNotification(
      push('/en/admin/inbox?view=chat&conversation=conv_store_1', 'chat_message')
    );
    const elsewhere = await handler.handleNotification(
      push('/en/admin/inbox?view=chat&conversation=conv_store_2', 'chat_message')
    );
    const order = await handler.handleNotification(
      push('/en/admin/orders/ord_1042', 'order_placed')
    );

    expect(here).toMatchObject({ shouldShowBanner: false, shouldShowList: false });
    expect(elsewhere).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
    expect(order).toMatchObject({ shouldShowBanner: true });
  });
});

/** A tapped push opens its screen. */
describe('a tapped push', () => {
  it('a message opens its conversation, marks the notification read, and is forgotten', async () => {
    tapped('/en/admin/inbox?view=chat&conversation=conv_store_1', 'chat_message', 'ntf_p2');
    await signInTapped('admin@example.com');

    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
    expect(clearLastNotificationResponseAsync).toHaveBeenCalled();

    jest.mocked(useLastNotificationResponse).mockReturnValue(null);
    await act(async () => router.push('/more/notifications'));
    await settle();
    expect(await screen.findByRole('button', { name: /^New message,/ })).toBeVisible();
  });

  it('a seller’s application opens it', async () => {
    tapped('/en/admin/vendors/vendor_sunrise', 'vendor_application');
    await signInTapped('admin@example.com');

    expect(await screen.findByRole('header', { name: 'Sunrise Bakery' })).toBeVisible();
  });

  it('a payout opens it, and the payouts their list', async () => {
    tapped('/en/vendor/payouts/pay_7', 'payouts');
    await signInTapped('seller@example.com');
    expect(await screen.findByRole('header', { name: 'PO-2026-0007' })).toBeVisible();
  });

  it('the payouts open their list', async () => {
    tapped('/en/vendor/payouts', 'payouts');
    await signInTapped('seller@example.com');
    expect(await screen.findByRole('header', { name: 'Payouts' })).toBeVisible();
  });

  it('a low-stock alert opens the low-stock list', async () => {
    tapped('/en/vendor/products', 'product_low_stock');
    await signInTapped('seller@example.com');

    expect(currentPath()).toBe('/products');
    expect(await screen.findByRole('button', { name: 'Remove filter: Low stock' })).toBeVisible();
  });

  it('an order opens the order', async () => {
    tapped('/en/vendor/orders/ord_1042', 'order_placed');
    await signInTapped('seller@example.com');

    expect(currentPath()).toBe('/orders/ord_1042');
  });
});
