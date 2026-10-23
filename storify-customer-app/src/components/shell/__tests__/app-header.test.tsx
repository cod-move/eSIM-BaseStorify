import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { AppHeader, HeaderButton, HeaderTitle } from '../app-header';

const inLocale = (locale: string) =>
  function LocaleProvider({ children }: PropsWithChildren) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </IntlProvider>
    );
  };

describe('AppHeader', () => {
  it('names its title as a heading and its back button "Back"', async () => {
    const onBack = jest.fn();
    await render(<AppHeader title="Orders" onBack={onBack} topInset={0} />, {
      wrapper: inLocale('en'),
    });

    expect(screen.getByRole('header', { name: 'Orders' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('closes a sheet with a button, and shows no back button there', async () => {
    const onClose = jest.fn();
    await render(<AppHeader title="Filters" onClose={onClose} topInset={0} />, {
      wrapper: inLocale('en'),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('puts the buttons it is given before the close button, and reads them in the shopper’s language', async () => {
    await render(
      <AppHeader
        title="عنوان"
        onBack={() => {}}
        onClose={() => {}}
        trailing={<HeaderButton icon="heart" label="Save" onPress={() => {}} />}
        topInset={0}
      />,
      { wrapper: inLocale('ar') }
    );

    const names = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel);
    expect(names).toEqual([getMessages('ar').shell.back, 'Save', getMessages('ar').shell.close]);
  });

  it('draws the view it is given in place of the title', async () => {
    await render(
      <AppHeader titleView={<HeaderTitle icon="lock" title="Security" />} topInset={0} />,
      { wrapper: inLocale('en') }
    );

    expect(screen.getByRole('header', { name: 'Security' })).toBeTruthy();
  });
});
