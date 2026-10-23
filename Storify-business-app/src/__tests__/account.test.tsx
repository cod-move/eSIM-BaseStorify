import { act, screen, waitFor } from '@testing-library/react-native';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { queryClient } from '@/api/query-client';
import { queryKeys, WORKSPACE_QUERIES } from '@/api/query-keys';
import { useGate } from '@/api/gate';
import { MOCK_TOTP_CODE } from '@/api/mocks/server';
import type { Me } from '@/contracts/mobile/biz/v1';
import { selectUploadFile } from '@/features/uploads/select-file';
import { selectedUploadFile } from '@/features/uploads/selected-file';
import { useLocaleStore } from '@/i18n/locale-store';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import './hooks';
import './preload-app';
import { openApp, openTab, press, settle, signInOnScreen, tap, type } from './screens';

jest.mock('@/features/uploads/select-file', () => ({ selectUploadFile: jest.fn() }));

async function openAccount(email: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await act(async () => router.push('/more/account'));
  await settle();
  await screen.findByRole('header', { name: 'Account' });
}

/** Signs in (with the second step, for an account that has it) and opens the Account tab. */
async function openAccountTab(email: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  if (email === 'two-step@example.com') {
    await type('Authentication code', MOCK_TOTP_CODE);
    await settle();
  }
  await screen.findByRole('tab', { name: 'Home' });
  await openTab('Account');
  await screen.findByRole('header', { name: 'Settings' });
}

type Permission = Awaited<ReturnType<typeof getPermissionsAsync>>;

/** A tool card's status line, which a screen reader hears as its value. */
const statusOf = (name: string) =>
  screen.getByRole('button', { name }).props.accessibilityValue?.text as string | undefined;

/** Chooses a row of the picker sheet that is open, and lets it close. */
async function choose(title: string): Promise<void> {
  await settle();
  const rows = await screen.findAllByRole('radio', { name: title });
  await tap(rows[rows.length - 1]!);
  // The sheet slides out before the choice is handed over.
  for (let step = 0; step < 6; step++) await settle();
}

/** The operator's own GET /me, as the cache holds it now. */
const cachedMe = () => queryClient.getQueryData<Me>(queryKeys.me('en'));

/** Lets a sheet slide out and what waited for it run. */
async function afterSheet(): Promise<void> {
  for (let step = 0; step < 6; step++) await settle();
}

/** The profile picture, changed from the account page. */
describe('the profile picture', () => {
  it('becomes a photo chosen on the phone, cropped to a square, and goes again', async () => {
    jest
      .mocked(selectUploadFile)
      .mockImplementationOnce(async (_source, policy) =>
        selectedUploadFile(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), 'me.jpg', policy)
      );
    await openAccount('admin@example.com');
    expect(screen.getByText('Your name and email are changed on the website.')).toBeVisible();

    await press('Change profile picture');
    await settle();
    await press('Choose a photo');
    await afterSheet();

    expect(await screen.findByText('Profile picture updated')).toBeVisible();
    expect(selectUploadFile).toHaveBeenCalledWith(
      'photo-library',
      expect.objectContaining({ mimeTypes: expect.arrayContaining(['image/jpeg']) }),
      { square: true }
    );
    // The store's answer is GET /me at once: the Account tab shows it too.
    expect(cachedMe()?.imageUrl).toMatch(/^data:image\/jpeg;base64,/);

    await press('Change profile picture');
    await settle();
    await press('Remove picture');
    await afterSheet();
    expect(await screen.findByText('Profile picture removed')).toBeVisible();
    expect(cachedMe()?.imageUrl).toBeUndefined();
  });

  it('offers no removal without a picture, and says why a photo was refused', async () => {
    jest
      .mocked(selectUploadFile)
      .mockImplementationOnce(async (_source, policy) =>
        selectedUploadFile(new Blob(['%PDF'], { type: 'application/pdf' }), 'me.pdf', policy)
      );
    await openAccount('staff@example.com');
    await press('Change profile picture');
    await settle();
    expect(screen.queryByRole('button', { name: 'Remove picture' })).toBeNull();

    await press('Take a photo');
    await afterSheet();
    expect(await screen.findByText('The store does not accept this file type.')).toBeVisible();
    expect(cachedMe()?.imageUrl).toBeUndefined();
  });
});

/** Account: the language, and what a change of it must not do. */
describe('Account', () => {
  it('opens the store dashboard and the storefront in the phone’s browser', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await openAccountTab('admin@example.com');

    await tap(screen.getByRole('link', { name: 'Store dashboard' }));
    expect(openURL).toHaveBeenLastCalledWith('https://mock.storify.invalid/en/login');
    await tap(screen.getByRole('link', { name: 'Storefront' }));
    expect(openURL).toHaveBeenLastCalledWith('https://mock.storify.invalid/');
    openURL.mockRestore();
  });

  it('changes the language in place, keeping the tab and the workspace', async () => {
    await openAccountTab('admin@example.com');
    await settle();
    const workspaceData = () =>
      queryClient.getQueryCache().findAll({ queryKey: WORKSPACE_QUERIES }).length;
    expect(workspaceData()).toBeGreaterThan(0);

    await press('Language, English');
    await choose('বাংলা');

    expect(useLocaleStore.getState()).toMatchObject({ locale: 'bn', chosen: true });
    expect(await screen.findByRole('header', { name: 'সেটিংস' })).toBeVisible();
    expect(workspaceData()).toBeGreaterThan(0);
    // The tabs are all still there, under their new names.
    expect(screen.getAllByRole('tab').length).toBe(5);
  });

  it('asks before a language that turns the layout around, once the picker has closed', async () => {
    await openAccountTab('admin@example.com');

    await press('Language, English');
    await choose('العربية');

    expect(await screen.findByText('Switch to العربية?')).toBeOnTheScreen();
    expect(useLocaleStore.getState().locale).toBe('en');

    await press('Switch and restart');
    expect(useLocaleStore.getState()).toMatchObject({ locale: 'ar', chosen: true });
  });

  it('keeps the operator on their screen after "Not now" on update required', async () => {
    await openAccount('admin@example.com');

    await act(async () => useGate.getState().requireUpdate({ minVersion: '9.0.0' }));
    await press('Not now');
    await settle();

    expect(screen.queryByText('Update the app')).toBeNull();
    expect(screen.getByRole('header', { name: 'Account' })).toBeVisible();
  });
});

/** The Account tab: who and where, what needs the operator, their tools, their settings. */
describe('The Account tab', () => {
  afterEach(() => {
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(async () => ({ granted: false }) as Permission);
  });

  it('says who and where the operator is, and what waits in their tools', async () => {
    await openAccountTab('admin@example.com');

    expect(
      screen.getByRole('button', { name: 'Amina Rahman, Administrator · Storify Demo Store' })
    ).toBeVisible();
    // One workspace: nothing to switch to.
    expect(screen.queryByRole('button', { name: /, Switch$/ })).toBeNull();
    await waitFor(() => expect(statusOf('Returns and refunds')).toBe('1 open'));
    expect(statusOf('Seller applications')).toBe('Review sellers who applied');
    expect(screen.getByRole('button', { name: 'Customers' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Payouts' })).toBeNull();
  });

  it('nudges toward two-step verification until it is on', async () => {
    await openAccountTab('admin@example.com');

    expect(screen.getByText('Turn on two-step verification')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Account and security, Two-step off' })
    ).toBeVisible();
    await tap(screen.getByRole('link', { name: 'Set up' }));
    await settle();
    expect(await screen.findByRole('header', { name: 'Two-step verification' })).toBeVisible();
  });

  it('leaves the nudge out once two-step verification is on', async () => {
    await openAccountTab('two-step@example.com');

    expect(screen.queryByText('Turn on two-step verification')).toBeNull();
    expect(screen.getByRole('button', { name: 'Account and security' })).toBeVisible();
  });

  it('shows a seller what is ready to pay, and none of the store’s tools', async () => {
    await openAccountTab('seller@example.com');

    await waitFor(() => expect(statusOf('Payouts')).toMatch(/186\.40 ready to pay$/));
    expect(screen.queryByRole('button', { name: 'Seller applications' })).toBeNull();
  });

  it('keeps out the tools the operator may not use', async () => {
    await openAccountTab('staff@example.com');

    expect(screen.getByRole('button', { name: 'Scan barcode' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Returns and refunds' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Customers' })).toBeNull();
  });

  it('says whether notifications reach this phone, and asks for them while it can', async () => {
    localStorage.setItem(STORAGE_KEYS.pushAsked, '1');
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(
        async () => ({ granted: false, status: 'undetermined', canAskAgain: true }) as Permission
      );
    await openAccountTab('admin@example.com');

    await press('Notifications on this phone, Off');
    expect(requestPermissionsAsync).toHaveBeenCalled();
  });

  it('opens the phone’s settings for notifications that are on', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    jest
      .mocked(getPermissionsAsync)
      .mockImplementation(async () => ({ granted: true, status: 'granted' }) as Permission);
    await openAccountTab('admin@example.com');

    await press('Notifications on this phone, On');
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });
});
