import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as endpoints from '@/api/endpoints/payouts';
import { keepMockPayoutCurrencies } from '@/api/mocks/routes/payouts';
import { dropNextRequest } from '@/api/mocks/server';

import './hooks';
import './preload-app';
import { openTab, press, settle, signIn, tap, wait } from './screens';

async function openPayouts(): Promise<void> {
  await signIn('seller@example.com');
  await openTab('Account');
  await press('Payouts');
  await settle();
  await screen.findByRole('header', { name: 'Payouts' });
}

/** The payouts the list shows, by number. */
function listed(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel ?? ''))
    .filter((label) => label.startsWith('PO-'))
    .map((label) => label.split(',')[0]!);
}

/** The currencies offered for the balance, and the one chosen. */
function currencies(): { offered: string[]; chosen: string | undefined } {
  const chips = screen
    .queryAllByRole('radio')
    .filter((chip) => /^[A-Z]{3}$/.test(String(chip.props.accessibilityLabel)));
  return {
    offered: chips.map((chip) => String(chip.props.accessibilityLabel)),
    chosen: chips.find((chip) => chip.props.accessibilityState?.checked)?.props.accessibilityLabel,
  };
}

/**
 * What the Account tab's Payouts card says. The tab stays under the screen,
 * hidden from it, where the card's pressed-state wrapper is found as well.
 */
function accountCard(): string | undefined {
  return screen
    .getAllByRole('button', { name: 'Payouts', includeHiddenElements: true })
    .map((card) => card.props.accessibilityValue?.text as string | undefined)
    .find(Boolean);
}

/** Scrolls to the end of the list. Rows are 300 pt each in the tests (jest.setup.ts), in a 900 pt window. */
async function scrollToTheEnd(): Promise<void> {
  await fireEvent.scroll(screen.getByTestId('payout-list'), {
    nativeEvent: {
      contentOffset: { x: 0, y: 1500 },
      contentSize: { width: 400, height: 2400 },
      layoutMeasurement: { width: 400, height: 900 },
    },
  });
  await settle();
}

/** A seller's money: read only, in the vendor workspace. */
describe('payouts', () => {
  it('shows what is ready to pay, what is kept back and what is owed to the store', async () => {
    await openPayouts();

    expect(screen.getByLabelText('Ready to pay, $186.40, For 6 orders')).toBeVisible();
    expect(
      screen.getByLabelText(
        'In the return window, $94.50, 3 orders · paid once the 7-day return window ends'
      )
    ).toBeVisible();
    expect(
      screen.getByLabelText(
        'Owed to the store, $12.00, Refunds made after a payout, taken off your next one'
      )
    ).toBeVisible();
    expect(
      screen.getByLabelText('Smallest payout, $50.00, The store pays out from this amount')
    ).toBeVisible();
    expect(screen.getByLabelText(/^Reserve, \$15\.00, .*first release/)).toBeVisible();
  });

  it('shows the balance in the currency the seller chooses, and keeps the choice', async () => {
    await openPayouts();
    expect(currencies()).toEqual({ offered: ['EUR', 'USD'], chosen: 'USD' });

    await tap(screen.getByRole('radio', { name: 'EUR' }));
    await settle();

    expect(currencies()).toEqual({ offered: ['EUR', 'USD'], chosen: 'EUR' });
    expect(screen.getByLabelText('Ready to pay, €72.50, For 2 orders')).toBeVisible();
    expect(
      screen.getByLabelText(
        'In the return window, €38.00, 1 order · paid once the 7-day return window ends'
      )
    ).toBeVisible();
    expect(
      screen.getByLabelText('Smallest payout, €45.00, The store pays out from this amount')
    ).toBeVisible();
    expect(screen.queryByLabelText(/^Ready to pay, \$/)).toBeNull();
    // Each payout stays in the currency it was made in.
    expect(screen.getByRole('button', { name: /^PO-2026-0008, \$394\.80, / })).toBeVisible();

    // Kept while the same person uses the app: on the Account tab, and here again.
    await act(async () => router.back());
    await settle();
    expect(accountCard()).toBe('€72.50 ready to pay');
    await press('Payouts');
    await settle();
    expect(screen.getByLabelText('Ready to pay, €72.50, For 2 orders')).toBeVisible();

    await tap(screen.getByRole('radio', { name: 'USD' }));
    await settle();
    expect(screen.getByLabelText('Ready to pay, $186.40, For 6 orders')).toBeVisible();
  });

  it('says a balance it cannot read is unavailable, never zero', async () => {
    await openPayouts();

    // The balance in euros, and both of its retries, never reach the store.
    dropNextRequest(3, { method: 'GET', path: /\/payouts\/summary$/ });
    await tap(screen.getByRole('radio', { name: 'EUR' }));
    await wait(10_000);

    expect(screen.getByLabelText('Ready to pay, Unavailable')).toBeVisible();
    expect(screen.getByText('Please check your internet connection and try again.')).toBeVisible();
    expect(screen.queryByText(/[$€]0\.00/)).toBeNull();
    expect(screen.queryByLabelText(/^Ready to pay, [$€]/)).toBeNull();
    expect(accountCard()).toBe('Balance and payouts');
    // The choice stays, to go back.
    expect(currencies()).toEqual({ offered: ['EUR', 'USD'], chosen: 'EUR' });

    await tap(screen.getByRole('link', { name: 'Try again' }));
    await settle();
    expect(screen.getByLabelText('Ready to pay, €72.50, For 2 orders')).toBeVisible();
  });

  it('says when the figure is partial, or cannot be paid out now', async () => {
    const original = endpoints.getPayoutSummary;
    const summary = jest
      .spyOn(endpoints, 'getPayoutSummary')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        return result.notModified
          ? result
          : { ...result, data: { ...result.data, eligible: false, hasMore: true } };
      });
    await openPayouts();

    expect(screen.getByLabelText('Ready to pay, $186.40, For 6 orders')).toBeVisible();
    expect(
      screen.getByText("Not payable yet: the store can't pay this amount out now.")
    ).toBeVisible();
    expect(
      screen.getByText('A partial figure: the store counted only some of your orders in it.')
    ).toBeVisible();
    // Not "ready to pay" on the Account tab either.
    await act(async () => router.back());
    await settle();
    expect(accountCard()).toBe('Balance and payouts');
    summary.mockRestore();
  });

  it('offers no choice of currency to a seller who sells in one', async () => {
    keepMockPayoutCurrencies('vendor_green', ['USD']);
    await openPayouts();

    expect(screen.getByLabelText('Ready to pay, $186.40, For 6 orders')).toBeVisible();
    expect(currencies().offered).toEqual([]);
    expect(screen.queryByText('Currency')).toBeNull();
  });

  it('lists the payouts, the newest first, and by status', async () => {
    await openPayouts();

    expect(listed()).toEqual([
      'PO-2026-0008',
      'PO-2026-0007',
      'PO-2026-0006',
      'PO-2026-0005',
      'PO-2026-0004',
    ]);
    expect(
      screen.getByRole('button', { name: /^PO-2026-0008, \$394\.80, Processing, / })
    ).toBeVisible();

    // The oldest, made in euros, in its own currency.
    await scrollToTheEnd();
    expect(listed()).toContain('PO-2026-0003');
    expect(screen.getByRole('button', { name: /^PO-2026-0003, €201\.00, Paid, / })).toBeVisible();

    await tap(screen.getByRole('tab', { name: 'Paid' }));
    await settle();
    expect(listed()).toEqual(['PO-2026-0007', 'PO-2026-0006', 'PO-2026-0004', 'PO-2026-0003']);

    await tap(screen.getByRole('tab', { name: 'Cancelled' }));
    await settle();
    expect(await screen.findByText('No payouts here')).toBeVisible();
  });

  it('reads the payouts again on coming back to them', async () => {
    // The list's first read, and both of its retries, never reach the store.
    dropNextRequest(3, { method: 'GET', path: /\/payouts$/ });
    await openPayouts();
    await wait(10_000);
    expect(
      await screen.findByText('Please check your internet connection and try again.')
    ).toBeVisible();
    expect(listed()).toEqual([]);

    await act(async () => router.push('/more/notifications'));
    await settle();
    await act(async () => router.back());
    await settle();

    expect(listed()).toContain('PO-2026-0008');
  });

  it('opens a payout: what the seller receives and what it is made of', async () => {
    await openPayouts();

    await tap(screen.getByRole('button', { name: /^PO-2026-0007,/ }));
    await settle();

    expect(await screen.findByRole('header', { name: 'PO-2026-0007' })).toBeVisible();
    for (const fact of [
      'Sales, $538.50',
      "Store's commission, $53.85",
      'Delivery charges, $32.00',
      'Adjustments, -$12.00',
      'You receive, $504.65',
      'Orders, 15',
      'Paid by, Bank transfer',
      'Reference, BRAC-77812',
    ]) {
      expect(screen.getByLabelText(fact)).toBeVisible();
    }
  });

  it('is not there for a seller’s staff', async () => {
    await signIn('seller-staff@example.com');
    await openTab('Account');

    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Payouts' })).toBeNull();
  });

  it('says so when a payout is not the seller’s', async () => {
    await signIn('seller@example.com');
    await act(async () => router.push({ pathname: '/payouts/[id]', params: { id: 'pay_404' } }));
    await settle();

    expect(
      await screen.findByText(
        "We couldn't find that. It may have been removed, or it's outside what you can see."
      )
    ).toBeVisible();
  });
});
