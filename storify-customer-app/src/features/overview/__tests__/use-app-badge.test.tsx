import { act, waitFor } from '@testing-library/react-native';
import { setBadgeCountAsync } from 'expo-notifications';

import { MOCK_PASSWORD } from '@/api/mocks/server';
import { badgeCount } from '@/components/ui/badge';
import { renderAuthHook, startFresh } from '@/features/auth/__tests__/auth-hook';
import { useMarkNotificationsRead } from '@/features/notifications/use-notifications';
import { authClient } from '@/lib/auth-client';

import { useAppBadge } from '../use-app-badge';
import { useUnreadNotificationCount } from '../use-overview';

jest.mock('expo-notifications', () => ({
  setBadgeCountAsync: jest.fn(),
}));

beforeEach(async () => {
  await startFresh();
  jest.clearAllMocks();
  jest.mocked(setBadgeCountAsync).mockResolvedValue(true);
});

describe('the unread count', () => {
  it('is the bell and the icon badge together, and falls to nothing once all are read', async () => {
    await act(async () => {
      await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
    });
    const { result } = await renderAuthHook(() => {
      useAppBadge();
      return { unread: useUnreadNotificationCount(), mark: useMarkNotificationsRead() };
    });

    await waitFor(() => expect(result.current.unread).toBeGreaterThan(0));
    const unread = result.current.unread;
    expect(setBadgeCountAsync).toHaveBeenLastCalledWith(unread);
    expect(badgeCount(unread)).not.toBeNull();

    await act(() => result.current.mark.mutateAsync({ all: true }));

    await waitFor(() => expect(result.current.unread).toBe(0));
    expect(setBadgeCountAsync).toHaveBeenLastCalledWith(0);
    expect(badgeCount(result.current.unread)).toBeNull();
  });

  it('clears the icon badge for a guest', async () => {
    await renderAuthHook(() => useAppBadge());

    await waitFor(() => expect(setBadgeCountAsync).toHaveBeenCalledWith(0));
  });
});
