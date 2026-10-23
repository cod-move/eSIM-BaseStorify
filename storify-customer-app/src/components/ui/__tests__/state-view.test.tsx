import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { Button } from '../button';
import { EmptyState, ErrorState, HandoffState, SuccessState } from '../state-view';

const inLocale = (locale: string) =>
  function LocaleProvider({ children }: PropsWithChildren) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </IntlProvider>
    );
  };

describe('state views', () => {
  it('empty: says what is missing and offers the way on', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="Your cart is empty"
        body="Browse the store."
        action={<Button label="Start shopping" onPress={onPress} />}
      />,
      { wrapper: inLocale('en') }
    );

    expect(screen.getByText('Your cart is empty')).toBeOnTheScreen();
    expect(screen.getByText('Browse the store.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start shopping' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('error: explains and retries', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState error={new Error('boom')} onRetry={onRetry} />, {
      wrapper: inLocale('en'),
    });

    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error: has no retry button when there is nothing to retry', async () => {
    await render(<ErrorState error={new Error('boom')} />, { wrapper: inLocale('en') });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('error: speaks the shopper language', async () => {
    await render(<ErrorState error={new Error('boom')} onRetry={() => {}} />, {
      wrapper: inLocale('ar'),
    });

    expect(screen.getByText('حدث خطأ ما')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'حاول مرة أخرى' })).toBeOnTheScreen();
  });

  it('success: shows the title, the line and the actions', async () => {
    await render(
      <SuccessState
        title="Payment Successful!"
        body="Your order is on its way."
        actions={<Button label="Continue Shopping" onPress={() => {}} />}
      />,
      { wrapper: inLocale('en') }
    );

    expect(screen.getByText('Payment Successful!')).toBeOnTheScreen();
    expect(screen.getByText('Your order is on its way.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue Shopping' })).toBeOnTheScreen();
  });

  it('hand-off: a title and a line, no buttons', async () => {
    await render(<HandoffState title="Signing you in…" body="alex@example.com" />, {
      wrapper: inLocale('en'),
    });

    expect(screen.getByText('Signing you in…')).toBeOnTheScreen();
    expect(screen.getByText('alex@example.com')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
