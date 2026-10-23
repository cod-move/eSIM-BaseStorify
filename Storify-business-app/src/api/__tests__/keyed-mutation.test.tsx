import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { ApiError, NetworkError } from '../errors';
import {
  AlreadySending,
  AttemptAbandoned,
  clearAttempts,
  useKeyedMutation,
} from '../keyed-mutation';

const lost = () => new NetworkError('offline');
const refused = () => new ApiError(409, 'CONFLICT', 'No', { reason: 'TRANSITION_NOT_ALLOWED' });
const slowDown = () => new ApiError(429, 'RATE_LIMITED', 'Slow down');

/** The hook on a send whose answers a test lists, with every key it was sent with. */
async function setup(answers: (unknown | Error)[]) {
  const keys: string[] = [];
  const send = jest.fn(async (_request: { step: string }, key: string) => {
    keys.push(key);
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const client = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(
    () => useKeyedMutation({ attemptKey: () => ['order-action', 'o1'], send }),
    { wrapper }
  );
  /** One tap, with the waits between retries passed at once. */
  const tap = async (request = { step: 'ship' }) => {
    let outcome: unknown;
    await act(async () => {
      const done = result.current.submit(request).then(
        (value) => (outcome = value),
        (error: unknown) => (outcome = error)
      );
      await jest.advanceTimersByTimeAsync(10_000);
      await done;
    });
    return outcome;
  };
  return { tap, keys, send, result };
}

beforeEach(() => {
  jest.useFakeTimers();
  clearAttempts();
});
afterEach(() => {
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

describe('one key per tap', () => {
  it('gives each answered tap a key of its own', async () => {
    const { tap, keys } = await setup(['first', 'second']);

    expect(await tap()).toBe('first');
    expect(await tap()).toBe('second');
    expect(new Set(keys).size).toBe(2);
  });

  it("sends a tap's retries with its own key", async () => {
    const { tap, keys } = await setup([lost(), lost(), 'done']);

    expect(await tap()).toBe('done');
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
  });

  it('keeps the key for the next tap of the same request when no answer came', async () => {
    const { tap, keys } = await setup([lost(), lost(), lost(), 'done']);

    expect(await tap()).toBeInstanceOf(NetworkError);
    expect(await tap()).toBe('done');
    expect(new Set(keys).size).toBe(1);
  });

  it('gives another request, or a tap after a refusal, a new key', async () => {
    const { tap, keys } = await setup([lost(), lost(), lost(), refused(), 'done']);

    await tap({ step: 'ship' });
    expect(await tap({ step: 'cancel' })).toBeInstanceOf(ApiError);
    expect(await tap({ step: 'cancel' })).toBe('done');
    expect(new Set(keys).size).toBe(3);
  });

  it('keeps the key when a refusal on a retry comes before the store looks at it', async () => {
    // The first try may have been made: the rate limit says nothing about it.
    const { tap, keys } = await setup([lost(), slowDown(), 'done']);

    expect(await tap()).toBeInstanceOf(ApiError);
    expect(await tap()).toBe('done');
    expect(new Set(keys).size).toBe(1);
  });

  it('stops a tap between its tries when the person changes', async () => {
    const { send, result } = await setup([lost(), 'done']);

    let outcome: unknown;
    await act(async () => {
      const done = result.current.submit({ step: 'ship' }).catch((error: unknown) => error);
      // The first try got no answer; the person signs out during the pause before the next.
      await jest.advanceTimersByTimeAsync(0);
      clearAttempts();
      await jest.advanceTimersByTimeAsync(10_000);
      outcome = await done;
    });

    expect(outcome).toBeInstanceOf(AttemptAbandoned);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('drops a second tap while the first is on its way', async () => {
    const { send, result } = await setup(['done']);

    let second: unknown;
    await act(async () => {
      const first = result.current.submit({ step: 'ship' });
      second = await result.current.submit({ step: 'ship' }).catch((error: unknown) => error);
      await first;
      // The hook's state reaches it on the next tick (a timer, faked here).
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(second).toBeInstanceOf(AlreadySending);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('done');
  });

  it('never sends a change while the phone is offline', async () => {
    const { tap, send } = await setup(['done']);
    onlineManager.setOnline(false);

    expect(await tap()).toBeInstanceOf(NetworkError);
    expect(send).not.toHaveBeenCalled();
  });
});
