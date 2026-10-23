import { act, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import {
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  type NotificationPermissionsStatus,
} from 'expo-notifications';

import { MOCK_PASSWORD } from '@/api/mocks/server';
import { routes } from '@/api/mocks/routes/devices';
import { renderAuthHook, startFresh } from '@/features/auth/__tests__/auth-hook';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useLocaleStore } from '@/i18n/locale-store';
import { authClient } from '@/lib/auth-client';

import { usePushRegistration } from '../use-push-registration';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: () => undefined })),
}));

const TOKEN = 'ExponentPushToken[n1-test]';

function permission(granted: boolean) {
  return { granted, status: granted ? 'granted' : 'denied', canAskAgain: true, expires: 'never' };
}

/** Every request the mock store's device routes answered, in order. */
function deviceCalls() {
  const [register, remove] = routes.map((route) => jest.spyOn(route, 'handle'));
  return { register: register!, remove: remove! };
}

beforeAll(() => {
  Constants.expoConfig!.extra = { eas: { projectId: 'n1-project' } };
});

beforeEach(async () => {
  await startFresh();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  useLocaleStore.setState({ locale: 'en' });
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValue(permission(true) as NotificationPermissionsStatus);
  jest.mocked(getExpoPushTokenAsync).mockResolvedValue({ type: 'expo', data: TOKEN });
});

async function signIn() {
  await act(async () => {
    await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
  });
}

function render() {
  return renderAuthHook(() => {
    usePushRegistration();
    return useSignOut();
  });
}

describe('usePushRegistration', () => {
  it('registers after sign-in, again after a language change, and removes the token before signing out', async () => {
    const calls = deviceCalls();
    await signIn();
    const { result } = await render();

    await waitFor(() => expect(calls.register).toHaveBeenCalledTimes(1));
    expect(calls.register.mock.calls[0]![0]).toMatchObject({
      locale: 'en',
      body: { token: TOKEN, platform: 'ios' },
    });
    expect(getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'n1-project' });

    await act(() => useLocaleStore.setState({ locale: 'bn' }));
    await waitFor(() => expect(calls.register).toHaveBeenCalledTimes(2));
    expect(calls.register.mock.calls[1]![0]).toMatchObject({
      locale: 'bn',
      body: { token: TOKEN },
    });

    await act(() => result.current.signOut());

    // The store still knew the shopper: the token was theirs, and is removed.
    expect(calls.remove).toHaveBeenCalledTimes(1);
    expect(calls.remove.mock.calls[0]![1]).toEqual([TOKEN]);
    expect(calls.remove.mock.results[0]!.value).toEqual({ removed: true });
  });

  it('registers nothing for a guest', async () => {
    const calls = deviceCalls();
    await render();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(calls.register).not.toHaveBeenCalled();
  });

  it('registers nothing without permission, and never asks for it', async () => {
    jest
      .mocked(getPermissionsAsync)
      .mockResolvedValue(permission(false) as NotificationPermissionsStatus);
    const calls = deviceCalls();
    await signIn();
    await render();

    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(calls.register).not.toHaveBeenCalled();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
