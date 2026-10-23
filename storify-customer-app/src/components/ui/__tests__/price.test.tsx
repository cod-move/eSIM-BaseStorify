import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { Money } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { Price } from '../price';

const inLocale = (locale: string) =>
  function LocaleProvider({ children }: PropsWithChildren) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </IntlProvider>
    );
  };

const money = (formatted: string, amount = 0): Money => ({ amount, currency: 'USD', formatted });

describe('Price', () => {
  it('prints the formatted price exactly as it arrived', async () => {
    // The amount and the text disagree on purpose: the app trusts `formatted`.
    await render(<Price price={money('1.234,50 €', 7)} />, { wrapper: inLocale('en') });
    expect(screen.getByText('1.234,50 €')).toBeTruthy();
  });

  it('shows the compare-at price and the store discount label, and says them as one phrase', async () => {
    await render(
      <Price price={money('$24.00')} compareAt={money('$30.00')} discountLabel="-20%" />,
      {
        wrapper: inLocale('en'),
      }
    );
    expect(screen.getByText('$24.00')).toBeTruthy();
    expect(screen.getByText('$30.00')).toBeTruthy();
    expect(screen.getByText('-20%')).toBeTruthy();
    expect(screen.getByLabelText('$24.00, was $30.00, -20%')).toBeTruthy();
  });

  it('works out no discount of its own', async () => {
    await render(<Price price={money('$24.00')} compareAt={money('$30.00')} />, {
      wrapper: inLocale('en'),
    });
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('puts "From" before the lowest price', async () => {
    await render(<Price price={money('$24.00')} from />, { wrapper: inLocale('en') });
    expect(screen.getByText('From $24.00')).toBeTruthy();
  });

  it('leaves "From" out when the price is discounted', async () => {
    await render(<Price price={money('$24.00')} compareAt={money('$30.00')} from />, {
      wrapper: inLocale('en'),
    });
    expect(screen.getByText('$24.00')).toBeTruthy();
    expect(screen.queryByText(/From/)).toBeNull();
  });

  it('says "Price on request" for a product sold by quote', async () => {
    await render(<Price onRequest />, { wrapper: inLocale('en') });
    expect(screen.getByText('Price on request')).toBeTruthy();
  });

  it('says it in Arabic', async () => {
    await render(<Price onRequest />, { wrapper: inLocale('ar') });
    expect(screen.getByText('السعر عند الطلب')).toBeTruthy();
  });

  it('draws nothing when there is no price and no quote', async () => {
    const view = await render(<Price />, { wrapper: inLocale('en') });
    expect(view.toJSON()).toBeNull();
  });

  it('prefers a price to "on request" when the store sends both', async () => {
    await render(<Price price={money('$24.00')} onRequest />, { wrapper: inLocale('en') });
    expect(screen.queryByText('Price on request')).toBeNull();
    expect(screen.getByText('$24.00')).toBeTruthy();
  });
});
