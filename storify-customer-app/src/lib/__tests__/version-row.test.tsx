import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { AppVersion } from '@/features/account/app-version';

const mockUpdates: { updateId: string | null } = { updateId: null };
jest.mock('expo-updates', () => ({
  get updateId() {
    return mockUpdates.updateId;
  },
}));

function Wrapper({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('AppVersion', () => {
  it('shows the version, the build and "built-in" when no update is running', async () => {
    mockUpdates.updateId = null;
    await render(<AppVersion />, { wrapper: Wrapper });

    expect(screen.getByLabelText('Version, 1.0.0')).toBeTruthy();
    expect(screen.getByLabelText('Build, 1')).toBeTruthy();
    expect(screen.getByLabelText('Update, built-in')).toBeTruthy();
  });

  it('shows the id of the update that is running', async () => {
    mockUpdates.updateId = '7d2f-41aa';
    await render(<AppVersion />, { wrapper: Wrapper });

    expect(screen.getByLabelText('Update, 7d2f-41aa')).toBeTruthy();
  });
});
