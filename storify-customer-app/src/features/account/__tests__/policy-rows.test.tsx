import { fireEvent, render, screen } from '@testing-library/react-native';
import { IntlProvider } from 'use-intl';

import { useConfig } from '@/features/config/use-config';
import { getMessages } from '@/i18n/messages';

import { PolicyRows } from '../policy-rows';

const mockOpenLink = jest.fn();
jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => mockOpenLink }));
jest.mock('@/features/config/use-config', () => ({ useConfig: jest.fn() }));

type Pages = { privacyPolicyUrl?: string; termsUrl?: string };

async function renderRows(pages: Pages | undefined) {
  // The row reads only `data.pages`; the rest of the query result is not its business.
  jest.mocked(useConfig).mockReturnValue({
    data: pages && { pages: { ...pages, accountDeletionUrl: 'https://shop.test/delete' } },
  } as ReturnType<typeof useConfig>);

  return await render(
    <IntlProvider locale="en" messages={getMessages('en')}>
      <PolicyRows />
    </IntlProvider>
  );
}

describe('the policy rows of the Account tab', () => {
  beforeEach(() => mockOpenLink.mockClear());

  it('shows no row while the store has published no address', async () => {
    await renderRows({});
    expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Terms and conditions' })).toBeNull();
  });

  it('shows no row before the settings have arrived', async () => {
    await renderRows(undefined);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows only the row whose page the store published', async () => {
    await renderRows({ termsUrl: 'https://shop.test/terms' });
    expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Terms and conditions' })).toBeTruthy();
  });

  it("opens the account deletion page through the app's own link handling", async () => {
    await renderRows({});

    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(mockOpenLink).toHaveBeenLastCalledWith('https://shop.test/delete');
  });

  it("follows the row's address as a link, which opens the app's own screen for it", async () => {
    await renderRows({
      privacyPolicyUrl: 'https://shop.test/privacy',
      termsUrl: 'https://shop.test/terms',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }));
    expect(mockOpenLink).toHaveBeenLastCalledWith('https://shop.test/privacy');

    await fireEvent.press(screen.getByRole('button', { name: 'Terms and conditions' }));
    expect(mockOpenLink).toHaveBeenLastCalledWith('https://shop.test/terms');
  });
});
