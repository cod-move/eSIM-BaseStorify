import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';
import * as Network from 'expo-network';

import { dropNextRequest } from '@/api/mocks/server';

import './hooks';
import './preload-app';
import { openApp, press, signInOnScreen } from './screens';

afterEach(() => {
  jest.restoreAllMocks();
  onlineManager.setOnline(true);
});

/**
 * The whole app, from the root layout down, on the mock store: the providers,
 * the app gate and the store's settings, and the shell's first screen.
 */
describe('the app', () => {
  it('opens on the store it is built for, in mock mode, at sign-in', async () => {
    await openApp();

    expect(await screen.findByText('Storify Demo Store')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByText('Mock data')).toBeVisible();
  });
});

/**
 * Long enough for a read to fail three times. `findBy…` moves the fake timers
 * on in small steps, so each retry's pause passes; one long jump would not.
 */
const RETRIES = { timeout: 10_000 };

/** A phone with no connection: the requests fail, and the phone says it is offline. */
function offline(path: RegExp): void {
  // Asked again each time the app opens (query-client.ts).
  jest
    .spyOn(Network, 'getNetworkStateAsync')
    .mockResolvedValue({ isConnected: false, isInternetReachable: false } as Network.NetworkState);
  onlineManager.setOnline(false);
  // Each read is tried three times before it fails.
  dropNextRequest(3, { method: 'GET', path });
}

describe('with no connection', () => {
  it('a first start says the store cannot be reached, instead of keeping the splash screen up', async () => {
    offline(/\/config$/);
    await openApp();

    expect(await screen.findByText("We can't reach the store", {}, RETRIES)).toBeVisible();
    await press('Try again');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  it('after the password, offers to try again or sign out while it cannot read who the operator is', async () => {
    await openApp();
    await screen.findByRole('button', { name: 'Sign in' });
    // The connection goes as the password is accepted: GET /me, the first, cannot be read.
    offline(/\/me$/);
    await signInOnScreen('admin@example.com');

    expect(await screen.findByRole('button', { name: 'Sign out' }, RETRIES)).toBeVisible();
    await press('Try again');
    expect(await screen.findByRole('tab', { name: 'Home' })).toBeVisible();
  });
});
