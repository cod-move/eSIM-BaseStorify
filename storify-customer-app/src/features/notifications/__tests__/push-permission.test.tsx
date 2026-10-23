import { act, waitFor } from '@testing-library/react-native';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  type NotificationPermissionsStatus,
} from 'expo-notifications';
import { Platform } from 'react-native';

import { MOCK_PASSWORD } from '@/api/mocks/server';
import { renderAuthHook, startFresh } from '@/features/auth/__tests__/auth-hook';
import { authClient } from '@/lib/auth-client';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { usePushMoment } from '../use-push-moment';
import { usePushPermission } from '../use-push-permission';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

function permission(status: 'undetermined' | 'granted' | 'denied') {
  const answer = {
    granted: status === 'granted',
    status,
    canAskAgain: status !== 'denied',
    expires: 'never',
  } as NotificationPermissionsStatus;
  return answer;
}

async function signIn() {
  await act(async () => {
    await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
  });
}

beforeEach(async () => {
  await startFresh();
  jest.clearAllMocks();
  storage.remove(STORAGE_KEYS.pushAsked);
  jest.mocked(getPermissionsAsync).mockResolvedValue(permission('undetermined'));
  jest.mocked(setNotificationChannelAsync).mockResolvedValue(null);
});

describe('the push permission moment', () => {
  it('opens once for a signed-in shopper who was never asked, and asks nothing until they accept', async () => {
    await signIn();
    const first = await renderAuthHook(() => usePushMoment());

    await waitFor(() => expect(first.result.current.open).toBe(true));
    expect(requestPermissionsAsync).not.toHaveBeenCalled();

    jest.mocked(requestPermissionsAsync).mockResolvedValue(permission('denied'));
    jest.mocked(getPermissionsAsync).mockResolvedValue(permission('denied'));
    await act(() => first.result.current.allow());
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(first.result.current.open).toBe(false);

    // The next order's screen, even if the phone forgot the refusal: no second ask.
    jest.mocked(getPermissionsAsync).mockClear();
    jest.mocked(getPermissionsAsync).mockResolvedValue(permission('undetermined'));
    const second = await renderAuthHook(() => usePushMoment());
    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    expect(second.result.current.open).toBe(false);
  });

  it('stays closed for a guest', async () => {
    const guest = await renderAuthHook(() => usePushMoment());
    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    expect(guest.result.current.open).toBe(false);
  });

  it('does not open again after "Not now"', async () => {
    await signIn();
    const shopper = await renderAuthHook(() => usePushMoment());
    await waitFor(() => expect(shopper.result.current.open).toBe(true));
    await act(async () => shopper.result.current.close());
    expect(shopper.result.current.open).toBe(false);
    expect(storage.get(STORAGE_KEYS.pushAsked)).toBe('1');
  });
});

describe('asking on Android', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
  });

  it('makes the notification channel before the prompt, which Android 13 needs to show one', async () => {
    Platform.OS = 'android';
    jest.mocked(requestPermissionsAsync).mockResolvedValue(permission('granted'));
    const { result } = await renderAuthHook(() => usePushPermission());
    await waitFor(() => expect(result.current.state).toBe('undetermined'));

    await act(async () => {
      await result.current.request();
    });

    expect(setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ importance: 5 })
    );
    const [channel] = jest.mocked(setNotificationChannelAsync).mock.invocationCallOrder;
    const [prompt] = jest.mocked(requestPermissionsAsync).mock.invocationCallOrder;
    expect(channel).toBeLessThan(prompt!);
  });
});
