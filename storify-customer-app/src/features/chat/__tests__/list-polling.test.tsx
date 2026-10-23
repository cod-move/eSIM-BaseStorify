import { act, waitFor } from '@testing-library/react-native';

import * as fixtures from '@/api/mocks/fixtures/chat';
import { MOCK_PASSWORD } from '@/api/mocks/server';
import { renderAuthHook, startFresh } from '@/features/auth/__tests__/auth-hook';
import { authClient } from '@/lib/auth-client';

import { POLL_MS, useConversations } from '../use-conversations';

let polling = true;

beforeEach(async () => {
  polling = true;
  await startFresh();
  await act(async () => {
    await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the conversations list', () => {
  it('asks the store again every few seconds while the screen is in front, and stops when it is not', async () => {
    const asked = jest.spyOn(fixtures, 'listConversations');
    jest.useFakeTimers();
    const { result, rerender } = await renderAuthHook(() => useConversations(polling));

    await waitFor(() => expect(result.current.data?.items.length).toBeGreaterThan(0));
    expect(asked).toHaveBeenCalledTimes(1);
    const first = result.current.data;

    await act(() => jest.advanceTimersByTimeAsync(POLL_MS));
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(2));
    // The store answered "not modified": the very same list, nothing to redraw.
    expect(result.current.data).toBe(first);

    polling = false;
    await rerender({});
    await act(() => jest.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(asked).toHaveBeenCalledTimes(2);
  });
});
