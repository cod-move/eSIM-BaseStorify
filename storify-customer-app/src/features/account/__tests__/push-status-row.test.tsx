import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { getPermissionsAsync, type NotificationPermissionsStatus } from 'expo-notifications';
import { Linking } from 'react-native';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { PushStatusRow } from '../push-status-row';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

function answer(status: 'granted' | 'denied'): NotificationPermissionsStatus {
  return {
    granted: status === 'granted',
    status,
    canAskAgain: status === 'granted',
    expires: 'never',
  } as NotificationPermissionsStatus;
}

function renderRow() {
  return render(
    <IntlProvider locale="en" messages={getMessages('en')}>
      <PushStatusRow />
    </IntlProvider>
  );
}

describe('the notifications row of Settings', () => {
  it('sends a shopper who refused to the phone settings', async () => {
    jest.mocked(getPermissionsAsync).mockResolvedValue(answer('denied'));
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderRow();

    const button = await screen.findByRole('button', { name: 'Open phone settings' });
    await act(async () => fireEvent.press(button));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('offers no phone settings while notifications are on', async () => {
    jest.mocked(getPermissionsAsync).mockResolvedValue(answer('granted'));
    await renderRow();

    await waitFor(() => expect(screen.getByText('On')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Open phone settings' })).toBeNull();
  });
});
