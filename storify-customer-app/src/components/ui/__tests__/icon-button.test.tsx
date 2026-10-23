import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { IconButton } from '../icon-button';

const inLocale = (locale: string) =>
  function LocaleProvider({ children }: PropsWithChildren) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </IntlProvider>
    );
  };

describe('IconButton', () => {
  it('is a button named by its label, and presses', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="close" label="Close" onPress={onPress} />, {
      wrapper: inLocale('en'),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says whether it is on', async () => {
    await render(
      <IconButton icon="heart" label="Remove from wishlist" variant="outlined" selected />,
      { wrapper: inLocale('en') }
    );

    expect(screen.getByRole('button', { name: 'Remove from wishlist' })).toBeSelected();
  });

  it('carries the count in its label, and nothing at zero', async () => {
    await render(
      <>
        <IconButton icon="cart" label="Cart" count={3} />
        <IconButton icon="heart" label="Wishlist" count={0} />
      </>,
      { wrapper: inLocale('en') }
    );

    expect(screen.getByRole('button', { name: 'Cart, 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wishlist' })).toBeTruthy();
  });

  it('says the count in Arabic', async () => {
    await render(<IconButton icon="cart" label="السلة" count={3} />, { wrapper: inLocale('ar') });

    expect(screen.getByRole('button', { name: /^السلة، / })).toBeTruthy();
  });

  it('does not press while disabled', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="close" label="Close" disabled onPress={onPress} />, {
      wrapper: inLocale('en'),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
