import type { NetworkState } from 'expo-network';

import { mockFetch } from '@/api/mocks';
import { isOffline } from '@/lib/network';

import { NetworkError } from '../errors';
import { transport } from '../transport';

/** The phone's network, switched by the test. */
type MockListener = (next: unknown) => void;

jest.mock('expo-network', () => {
  const listeners = new Set<MockListener>();
  // [esim-patch] P55 a fresh reading gives the state last emitted.
  let current: unknown = { isConnected: true, isInternetReachable: true };
  return {
    addNetworkStateListener: (listener: MockListener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    getNetworkStateAsync: () => Promise.resolve(current),
    mockEmit: (next: unknown) => {
      current = next;
      for (const listener of listeners) listener(next);
    },
  };
});

// What the transport hands a request to, watched.
jest.mock('@/api/mocks', () => ({
  mockFetch: jest.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
}));

const { mockEmit } = jest.requireMock<{ mockEmit: (state: NetworkState) => void }>('expo-network');
const sent = jest.mocked(mockFetch);

const URL = 'https://store.test/api/mobile/shop/v1/cart/items';

// The app starts watching the network when the banner mounts; here the first reading does.
beforeAll(() => {
  isOffline();
});

beforeEach(() => {
  sent.mockClear();
  mockEmit({ isConnected: true, isInternetReachable: true });
});

describe('transport', () => {
  it('sends nothing for a POST while offline, and rejects with the offline error', async () => {
    mockEmit({ isConnected: false, isInternetReachable: false });

    const error: unknown = await transport(URL, { method: 'POST', body: '{}' }).catch(
      (caught: unknown) => caught
    );

    expect(sent).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).kind).toBe('offline');
  });

  // [esim-patch] P55 refused only with no connection at all (src/lib/network.ts)
  it('refuses every change, whatever the case of its method, while disconnected', async () => {
    mockEmit({ isConnected: false, isInternetReachable: false });

    for (const method of ['put', 'PATCH', 'DELETE']) {
      await expect(transport(URL, { method })).rejects.toBeInstanceOf(NetworkError);
    }
    await expect(transport(new Request(URL, { method: 'POST' }))).rejects.toBeInstanceOf(
      NetworkError
    );
    expect(sent).not.toHaveBeenCalled();
  });

  // [esim-patch] P55
  it('sends a change when connected but Android could not reach Google', async () => {
    mockEmit({ isConnected: true, isInternetReachable: false });

    await transport(URL, { method: 'POST' });

    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('still sends a read while offline: it may find the network back', async () => {
    mockEmit({ isConnected: false, isInternetReachable: false });

    await transport(URL);
    await transport(URL, { method: 'GET' });

    expect(sent).toHaveBeenCalledTimes(2);
  });

  it('sends a POST again once the network is back', async () => {
    mockEmit({ isConnected: false, isInternetReachable: false });
    mockEmit({ isConnected: true, isInternetReachable: true });

    await transport(URL, { method: 'POST', body: '{}' });

    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('counts a network it cannot judge as online', async () => {
    mockEmit({ isConnected: true });

    await transport(URL, { method: 'POST', body: '{}' });

    expect(sent).toHaveBeenCalledTimes(1);
  });
});
