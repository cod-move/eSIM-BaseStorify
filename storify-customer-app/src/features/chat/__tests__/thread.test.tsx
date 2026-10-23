import { act, waitFor } from '@testing-library/react-native';

import * as fixtures from '@/api/mocks/fixtures/chat';
import { MOCK_PASSWORD } from '@/api/mocks/server';
import { renderAuthHook, startFresh } from '@/features/auth/__tests__/auth-hook';
import { authClient } from '@/lib/auth-client';

import { POLL_MS } from '../use-conversations';
import { useMarkRead, useSendMessage, useThread } from '../use-thread';

let polling = true;
let active = true;

beforeEach(async () => {
  polling = true;
  active = true;
  await startFresh();
  await act(async () => {
    await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a conversation', () => {
  it('asks for a page of messages the store accepts', async () => {
    // The mock store refuses a `limit` over the contract's, as the real one does.
    const { result } = await renderAuthHook(() => useThread('cnv_4', false));

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data?.items.length).toBeGreaterThan(0);
  });

  it('sends a message once, however often the button is tapped, and shows it', async () => {
    const stored = jest.spyOn(fixtures, 'sendMessage');
    const { result } = await renderAuthHook(() => ({
      thread: useThread('cnv_4', false),
      sending: useSendMessage('cnv_4'),
    }));
    await waitFor(() => expect(result.current.thread.data).toBeDefined());

    let taken: boolean[] = [];
    await act(async () => {
      taken = await Promise.all([
        result.current.sending.send('Thank you!'),
        result.current.sending.send('Thank you!'),
      ]);
    });

    expect(taken).toEqual([true, false]);
    expect(stored).toHaveBeenCalledTimes(1);
    expect(result.current.thread.data?.items[0]).toMatchObject({
      body: 'Thank you!',
      fromShopper: true,
    });
  });

  it('hands back the store’s refusal as the store words it, and reports the message not sent', async () => {
    const { result } = await renderAuthHook(() => useSendMessage('cnv_1'));

    let taken = true;
    await act(async () => {
      taken = await result.current.send('Hello?');
    });

    expect(taken).toBe(false);
    expect(result.current.error).toMatchObject({
      reason: 'CONVERSATION_CLOSED',
      message: 'This conversation was closed by the store. Start a new one.',
    });
  });

  it('marks the conversation read when it is opened, and not before', async () => {
    const read = jest.spyOn(fixtures, 'markRead');
    active = false;
    const { result, rerender } = await renderAuthHook(() => {
      const thread = useThread('cnv_4', false);
      useMarkRead('cnv_4', thread.data?.conversation.unreadCount, active);
      return thread;
    });
    await waitFor(() => expect(result.current.data?.conversation.unreadCount).toBe(2));
    expect(read).not.toHaveBeenCalled();

    active = true;
    await rerender({});

    await waitFor(() => expect(result.current.data?.conversation.unreadCount).toBe(0));
    expect(read).toHaveBeenCalledTimes(1);
    expect(fixtures.unreadMessageCount()).toBe(1);
  });

  it('asks the store again every few seconds only while the screen is in front', async () => {
    const asked = jest.spyOn(fixtures, 'listMessages');
    jest.useFakeTimers();
    const { result, rerender } = await renderAuthHook(() => useThread('cnv_4', polling));

    await waitFor(() => expect(result.current.data?.items.length).toBeGreaterThan(0));
    expect(asked).toHaveBeenCalledTimes(1);
    const first = result.current.data;

    await act(() => jest.advanceTimersByTimeAsync(POLL_MS));
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(2));
    // Not modified: the very same conversation, nothing to redraw.
    expect(result.current.data).toBe(first);

    polling = false;
    await rerender({});
    await act(() => jest.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(asked).toHaveBeenCalledTimes(2);
  });
});
