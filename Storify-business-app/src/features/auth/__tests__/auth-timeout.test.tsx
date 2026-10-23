import { act, renderHook } from '@testing-library/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { transport } from '@/api/transport';
import { authClient } from '@/lib/auth-client';

import { useSession } from '../use-session';
import { useSignOut, useSigningOut } from '../use-sign-out';

jest.mock('@/api/transport', () => ({ transport: jest.fn() }));

// As in src/__tests__/hooks.tsx: the auth library's Expo client works out the
// app's address only in an installed app.
Object.defineProperty(Constants, 'executionEnvironment', {
  configurable: true,
  value: ExecutionEnvironment.Standalone,
});

/** A connection that never answers: a request waits until it is called off. */
function neverAnswers(): void {
  jest.mocked(transport).mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  neverAnswers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('an auth server that never answers', () => {
  it('fails a call after 15 seconds instead of waiting for good', async () => {
    let outcome: unknown = 'waiting';
    void authClient.getSession().then(
      () => (outcome = 'answered'),
      (error: unknown) => (outcome = error)
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(14_000);
    });
    expect(outcome).toBe('waiting');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(outcome).toMatchObject({ name: 'AbortError' });
  });

  it('ends the session check too, which brings a signal of its own', async () => {
    const { result } = await renderHook(() => useSession());
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });
    expect(result.current.isPending).toBe(false);
  });

  it('does not hold the sign-out cover: it goes once the phone has forgotten the session', async () => {
    const { result } = await renderHook(() => ({ out: useSignOut(), covering: useSigningOut() }));
    let finished = false;

    await act(async () => {
      void result.current.out.signOut().then(() => (finished = true));
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(finished).toBe(true);
    expect(result.current.covering).toBe(false);
    const sent = jest.mocked(transport).mock.calls.map(([input]) => String(input));
    expect(sent.some((url) => url.endsWith('/sign-out'))).toBe(true);
    // The request itself is called off in time, and leaves nothing running.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });
  });
});
