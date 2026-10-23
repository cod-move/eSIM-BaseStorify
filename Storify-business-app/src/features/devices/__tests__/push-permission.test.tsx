import { act, renderHook } from '@testing-library/react-native';
import {
  AndroidImportance,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import type { PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { usePushPermission } from '../use-push-permission';

type Permission = Awaited<ReturnType<typeof getPermissionsAsync>>;

function wrapper({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

/** Runs the test as if on another platform. */
function onPlatform(os: typeof Platform.OS) {
  const original = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  return () => {
    if (original) Object.defineProperty(Platform, 'OS', original);
  };
}

describe('asking for push permission', () => {
  afterEach(() => {
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(async () => ({ granted: false }) as Permission);
  });

  it('on Android, creates the store’s channel first: the prompt shows only to an app with one', async () => {
    const restore = onPlatform('android');
    try {
      jest
        .mocked(getPermissionsAsync)
        .mockImplementation(async () => ({ granted: false, status: 'undetermined' }) as Permission);
      const { result } = await renderHook(() => usePushPermission(), { wrapper });
      await act(async () => {
        await result.current.request();
      });

      expect(setNotificationChannelAsync).toHaveBeenCalledWith('default', {
        name: 'Store notifications',
        importance: AndroidImportance.HIGH,
      });
      const channel = jest.mocked(setNotificationChannelAsync).mock.invocationCallOrder[0]!;
      const ask = jest.mocked(requestPermissionsAsync).mock.invocationCallOrder[0]!;
      expect(channel).toBeLessThan(ask);
    } finally {
      restore();
    }
  });

  it('on iOS, asks without a channel', async () => {
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(async () => ({ granted: false, status: 'undetermined' }) as Permission);
    const { result } = await renderHook(() => usePushPermission(), { wrapper });
    await act(async () => {
      await result.current.request();
    });

    expect(setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(requestPermissionsAsync).toHaveBeenCalled();
  });

  it('still offers to ask while the phone would (Android’s second chance), not once it refuses for good', async () => {
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(
        async () => ({ granted: false, status: 'denied', canAskAgain: true }) as Permission
      );
    const second = await renderHook(() => usePushPermission(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(second.result.current.state).toBe('undetermined');

    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(
        async () => ({ granted: false, status: 'denied', canAskAgain: false }) as Permission
      );
    const refused = await renderHook(() => usePushPermission(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(refused.result.current.state).toBe('denied');
  });

  it('in the browser preview, has no push to ask for', async () => {
    const restore = onPlatform('web');
    try {
      const { result } = await renderHook(() => usePushPermission(), { wrapper });
      expect(result.current.state).toBe('unsupported');
      await act(async () => {
        expect(await result.current.request()).toBe(false);
      });
      expect(requestPermissionsAsync).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
