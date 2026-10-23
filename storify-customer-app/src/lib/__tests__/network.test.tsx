import type { NetworkState } from 'expo-network';
import { act, screen } from 'expo-router/testing-library';
import { dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';

import { persistOptions, queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { transport } from '@/api/transport';

import { openApp } from '../../__tests__/helpers';

/** The phone's network, switched by the test. */
type MockListener = (next: unknown) => void;

jest.mock('expo-network', () => {
  const listeners = new Set<MockListener>();
  return {
    addNetworkStateListener: (listener: MockListener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    getNetworkStateAsync: () => Promise.resolve({ isConnected: true, isInternetReachable: true }),
    mockEmit: (next: unknown) => {
      for (const listener of listeners) listener(next);
    },
  };
});

// Every request the app sends, watched, so a test can take the network away.
jest.mock('@/api/transport', () => {
  const actual = jest.requireActual<typeof import('@/api/transport')>('@/api/transport');
  return { transport: jest.fn(actual.transport) };
});

const { mockEmit } = jest.requireMock<{ mockEmit: (state: NetworkState) => void }>('expo-network');
const { transport: realTransport } =
  jest.requireActual<typeof import('@/api/transport')>('@/api/transport');
const sent = jest.mocked(transport);

const OFFLINE: NetworkState = { isConnected: false, isInternetReachable: false };
const ONLINE: NetworkState = { isConnected: true, isInternetReachable: true };
const BANNER = 'You are offline. Showing what was saved on this phone.';
const HERO = 'Sound that\nfollows you';

const goOffline = () => act(() => mockEmit(OFFLINE));
const goOnline = () => act(() => mockEmit(ONLINE));

afterEach(() => {
  mockEmit(ONLINE);
  sent.mockImplementation(realTransport);
});

describe('offline', () => {
  it('shows the banner within 2 s of going offline, and takes it away when the network returns', async () => {
    await openApp();
    expect(await screen.findByText(HERO)).toBeTruthy();
    expect(screen.queryByText(BANNER)).toBeNull();

    await goOffline();
    expect(await screen.findByText(BANNER, {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByRole('alert', { name: BANNER })).toBeTruthy();

    await goOnline();
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it('opens Home from the saved cache with the network off', async () => {
    await openApp();
    expect(await screen.findByText(HERO)).toBeTruthy();
    // What the app keeps on the device, through the text it is stored as.
    const saved = JSON.parse(
      JSON.stringify(dehydrate(queryClient, persistOptions.dehydrateOptions))
    ) as DehydratedState;
    expect(saved.queries.map((query) => query.queryKey)).toContainEqual(queryKeys.home('en'));

    // The app is closed and opened again with no network at all.
    screen.unmount();
    queryClient.clear();
    hydrate(queryClient, saved);
    sent.mockImplementation(() => Promise.reject(new TypeError('Network request failed')));
    await goOffline();

    await openApp();

    expect(await screen.findByText(HERO)).toBeTruthy();
    expect(screen.getByText(BANNER)).toBeTruthy();
  });
});
