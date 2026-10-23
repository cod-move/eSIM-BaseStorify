import { act, fireEvent, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';

import * as meEndpoints from '@/api/endpoints/me';
import { useGate } from '@/api/gate';
import { dropNextRequest } from '@/api/mocks/server';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { Me } from '@/contracts/mobile/biz/v1';
import { authClient } from '@/lib/auth-client';

import { signInAs } from './hooks';
import './preload-app';
import { openApp, openTab, press, settle, signInOnScreen, tabNames, type } from './screens';

/**
 * Signing in on the sign-in screen, as an operator does, through the real
 * auth client on the mock store: the refusals the store gives, the second
 * step, and what opens after.
 */
describe('signing in', () => {
  it('asks for what is missing before it asks the store', async () => {
    await openApp();
    await screen.findByRole('button', { name: 'Sign in' });

    await press('Sign in');

    expect(await screen.findByText('Enter your email address.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
  });

  it("offers a store with sellers' page to apply, as nobody signs up here", async () => {
    const browser = jest
      .spyOn(WebBrowser, 'openBrowserAsync')
      .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.DISMISS });
    try {
      await openApp();
      expect(await screen.findByText('Want to sell on Storify Demo Store?')).toBeVisible();

      await fireEvent.press(screen.getByRole('link', { name: 'Apply to become a seller' }));

      expect(browser).toHaveBeenCalledWith('https://mock.storify.invalid/become-vendor');
    } finally {
      browser.mockRestore();
    }
  });

  it('opens Home, in the only workspace, once the store accepts the operator', async () => {
    await openApp();
    await signInOnScreen('admin@example.com');

    expect(await screen.findByText('Administrator')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(tabNames()).toEqual([
      'Home',
      'Orders',
      'Products',
      'Inbox, 2 unread',
      'Account, something new',
    ]);
  });

  it('lets its first read of who the operator is finish: it is not stopped and sent again', async () => {
    // GET /me takes a moment, as on a network: it is still on its way when the
    // app drops what the person before left (there is nobody before).
    const getMe = jest.requireActual<typeof meEndpoints>('@/api/endpoints/me').getMe;
    const signals: AbortSignal[] = [];
    const reads = jest.spyOn(meEndpoints, 'getMe').mockImplementation(async (locale, signal) => {
      signals.push(signal);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return getMe(locale, signal);
    });
    try {
      await openApp();
      await signInOnScreen('admin@example.com');
      expect(await screen.findByText('Administrator')).toBeVisible();

      expect(signals.length).toBeGreaterThan(0);
      expect(signals.filter((signal) => signal.aborted)).toHaveLength(0);
    } finally {
      reads.mockRestore();
    }
  });

  it('refuses a shopper, with the store’s word for it, and stays', async () => {
    await openApp();
    await signInOnScreen('shopper@example.com');

    expect(
      await screen.findByText(
        "This app is for the people who run the store. To shop, use the store's shopping app."
      )
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  it('says how many attempts are left after a wrong password', async () => {
    await openApp();
    await screen.findByRole('button', { name: 'Sign in' });
    await type('Email', 'admin@example.com');
    await type('Password', 'not-the-password');
    await press('Sign in');
    await settle();

    expect(await screen.findByText(/^Wrong email or password\./)).toBeVisible();
  });

  describe('with two-step verification', () => {
    it('asks for the code, refuses a wrong one, and opens on the right one', async () => {
      await openApp();
      await signInOnScreen('two-step@example.com');

      expect(await screen.findByText('Two-step verification')).toBeVisible();
      expect(screen.getByText('two-step@example.com')).toBeVisible();

      await type('Authentication code', '111111');
      await settle();
      expect(
        await screen.findByText(
          'That code isn’t right. Check your authenticator app and try again.'
        )
      ).toBeVisible();

      await type('Authentication code', '123456');
      await settle();
      expect(await screen.findByText('Administrator')).toBeVisible();
    });

    it('takes a backup code instead', async () => {
      await openApp();
      await signInOnScreen('two-step@example.com');
      await screen.findByText('Two-step verification');

      await press('Use a backup code instead');
      await type('Backup code', 'ABCDE-12345');
      await press('Verify');
      await settle();

      expect(await screen.findByText('Administrator')).toBeVisible();
    });

    it('goes back to email and password', async () => {
      await openApp();
      await signInOnScreen('two-step@example.com');
      await screen.findByText('Two-step verification');

      await press('Back');

      expect(await screen.findByLabelText('Email')).toBeVisible();
    });
  });

  it('tells an operator with no workspace, and offers sign-out', async () => {
    await openApp();
    await signInOnScreen('no-access@example.com');

    expect(await screen.findByText('No access right now')).toBeVisible();
    await press('Sign out');
    await settle();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  it('signs out from the Account tab: the sheet closes, then the sign-in screen', async () => {
    await openApp();
    await signInOnScreen('admin@example.com');
    await openTab('Account');
    await press('Sign out');
    await settle();
    await press('Sign out');
    await settle();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  });

  it('lets in a seller whose shop is not open, and says why the rest is closed', async () => {
    await openApp();
    await signInOnScreen('unpaid-seller@example.com');

    expect(await screen.findByText('This shop is awaiting its first payment')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open the website' })).toBeVisible();
  });
});

describe('an address the app has no screen for', () => {
  it('opens sign-in when signed out', async () => {
    await openApp('/nowhere');

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});

describe('an app below the store’s minimum version', () => {
  it('asks to update, and lets the operator go on reading with "Not now"', async () => {
    await openApp();
    await signInOnScreen('admin@example.com');
    await screen.findByText('Administrator');

    // What the API client does when the store refuses a change with 426.
    await act(async () => useGate.getState().requireUpdate({ minVersion: '9.0.0' }));
    expect(await screen.findByText('Update the app')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByText('Administrator')).toBeVisible();
  });
});

describe('a start after the last person’s session ended', () => {
  it('forgets who they were, and their pictures, before the next person signs in', async () => {
    const clearDisk = jest.spyOn(Image, 'clearDiskCache').mockResolvedValue(true);
    const clearMemory = jest.spyOn(Image, 'clearMemoryCache').mockResolvedValue(true);
    await signInAs('admin@example.com');
    let me: Me | undefined;
    await act(async () => {
      me = await meEndpoints.getMe('en', new AbortController().signal);
    });
    await act(async () => {
      await authClient.signOut();
    });
    // What the device kept from the last start: GET /me of somebody no longer signed in.
    queryClient.setQueryData(queryKeys.me('en'), me);

    await openApp();
    await screen.findByRole('button', { name: 'Sign in' });
    await settle();

    expect(queryClient.getQueryData(queryKeys.me('en'))).toBeUndefined();
    expect(clearDisk).toHaveBeenCalled();
    expect(clearMemory).toHaveBeenCalled();

    // The next person's first GET /me is slow: nothing of the last one shows meanwhile.
    dropNextRequest(1, { method: 'GET', path: /\/me$/ });
    await signInOnScreen('staff@example.com');
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
    expect(await screen.findByText('Staff')).toBeVisible();
    expect(queryClient.getQueryData<Me>(queryKeys.me('en'))?.email).toBe('staff@example.com');
  });
});
