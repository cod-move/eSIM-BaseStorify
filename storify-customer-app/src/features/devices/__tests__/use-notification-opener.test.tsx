import { act, waitFor } from '@testing-library/react-native';
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
  type NotificationResponse,
} from 'expo-notifications';

import { listNotifications } from '@/api/mocks/fixtures/notifications';
import { MOCK_PASSWORD } from '@/api/mocks/server';
import { renderAuthHook, startFresh } from '@/features/auth/__tests__/auth-hook';
import { authClient } from '@/lib/auth-client';

import { readPushTarget } from '../push-target';
import { useNotificationOpener } from '../use-notification-opener';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRootNavigationState: () => ({ key: 'root' }),
}));
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: () => undefined })),
}));

function tap(identifier: string, data: Record<string, unknown>): NotificationResponse {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: 0,
      request: {
        identifier,
        content: {
          title: null,
          subtitle: null,
          body: null,
          data,
          categoryIdentifier: null,
          sound: null,
        },
        trigger: { type: 'push' },
      },
    },
  };
}

const isRead = (id: string) => listNotifications().find((item) => item.id === id)?.read;

beforeEach(async () => {
  await startFresh();
  jest.clearAllMocks();
  jest.mocked(getLastNotificationResponse).mockReturnValue(null);
  await act(async () => {
    await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
  });
});

describe('useNotificationOpener', () => {
  it('opens the notification that started the app and marks it read', async () => {
    jest
      .mocked(getLastNotificationResponse)
      .mockReturnValue(tap('cold', { url: '/en/products/linen-shirt', notificationId: 'ntf_6' }));

    await renderAuthHook(useNotificationOpener);

    await waitFor(() => expect(isRead('ntf_6')).toBe(true));
    expect(mockPush).toHaveBeenCalledWith('/products/linen-shirt');
  });

  it('opens a notification tapped while the app is open, once', async () => {
    await renderAuthHook(useNotificationOpener);
    const listener = jest.mocked(addNotificationResponseReceivedListener).mock.calls[0]![0];

    await act(() =>
      listener(tap('warm', { url: '/bn/products/linen-shirt', notificationId: 'ntf_6' }))
    );
    await act(() =>
      listener(tap('warm', { url: '/bn/products/linen-shirt', notificationId: 'ntf_6' }))
    );

    await waitFor(() => expect(isRead('ntf_6')).toBe(true));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/products/linen-shirt');
  });

  it("opens a path the app has no screen for as the store's web page, inside the app", async () => {
    await renderAuthHook(useNotificationOpener);
    const listener = jest.mocked(addNotificationResponseReceivedListener).mock.calls[0]![0];

    await act(() => listener(tap('web', { url: '/en/account/quotes' })));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/web',
      params: { url: expect.stringMatching(/^https?:\/\/[^/]+\/en\/account\/quotes$/) },
    });
  });
});

describe('readPushTarget', () => {
  it('keeps only non-empty strings from data that arrives from outside', () => {
    expect(readPushTarget({ url: ' /en/cart ', notificationId: 'ntf_1', type: 'x' })).toEqual({
      url: '/en/cart',
      notificationId: 'ntf_1',
    });
    expect(readPushTarget({ url: 42, notificationId: '' })).toEqual({
      url: null,
      notificationId: null,
    });
    expect(readPushTarget(undefined)).toEqual({ url: null, notificationId: null });
  });
});
