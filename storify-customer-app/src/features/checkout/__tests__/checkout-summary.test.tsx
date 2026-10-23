import { renderRouter, screen } from 'expo-router/testing-library';
import { IntlProvider } from 'use-intl';

import type { CheckoutTotals, Money } from '@/contracts/mobile/shop/v1';
import { CheckoutBreakdown, CheckoutSummary } from '@/features/checkout/checkout-summary';
import { getMessages } from '@/i18n/messages';

const money = (amount: number, formatted: string): Money => ({
  amount,
  currency: 'USD',
  formatted,
});

/** A quote with nothing off and delivery that costs nothing, in the store's own words. */
const totals: CheckoutTotals = {
  subtotal: money(40, 'US$40.00'),
  discount: money(0, 'US$0.00 off'),
  shipping: money(0, 'Free delivery'),
  tax: money(0, 'US$0.00 tax'),
  total: money(40, 'US$40.00 total'),
  dueNow: money(40, 'US$40.00 now'),
};

async function showSummary(quoted: CheckoutTotals) {
  await renderRouter(
    {
      index: () => (
        <IntlProvider locale="en" messages={getMessages('en')}>
          <CheckoutBreakdown totals={quoted} />
          <CheckoutSummary totals={quoted} ready placing={false} onPlace={() => undefined} />
        </IntlProvider>
      ),
    },
    { initialUrl: '/' }
  );
}

describe('the checkout summary', () => {
  it('prints a zero discount and free delivery as the store wrote them', async () => {
    await showSummary(totals);

    for (const figure of [totals.subtotal, totals.discount, totals.shipping, totals.tax])
      expect(screen.getByText(figure?.formatted ?? '')).toBeTruthy();
    expect(screen.getByText(totals.total.formatted)).toBeTruthy();
    expect(screen.getByText('Discount')).toBeTruthy();
    // The app chooses no word of its own for a zero.
    expect(screen.queryByText('Free')).toBeNull();
  });

  it('pins only the total and the button, with what is due now', async () => {
    await showSummary(totals);

    expect(screen.getByRole('button', { name: 'Place order, US$40.00 now' })).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('says delivery is priced later only when the quote leaves it out', async () => {
    await showSummary({ ...totals, shipping: undefined });

    expect(screen.queryByText('Free delivery')).toBeNull();
    expect(screen.getByText('After address')).toBeTruthy();
  });
});
