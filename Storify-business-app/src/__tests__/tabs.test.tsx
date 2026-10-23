import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import './hooks';
import './preload-app';
import { openApp, openTab, settle, signInOnScreen, tabNames } from './screens';

/** The tabs' names without their badges ("Inbox, 2 unread" → "Inbox"). */
const tabs = () => tabNames().map((name) => name.split(',')[0]);

async function goTo(href: Parameters<typeof router.push>[0]): Promise<void> {
  await act(async () => router.push(href));
  await settle();
}

/**
 * Tabs, and the screens above them, by capability: each
 * shows only with its capability from GET /me in the current workspace, and
 * a hidden one cannot be opened by a link either: Home opens instead.
 */
describe('tabs by capability', () => {
  it.each([
    ['admin@example.com', ['Home', 'Orders', 'Products', 'Inbox', 'Account']],
    ['staff@example.com', ['Home', 'Orders', 'Products', 'Inbox', 'Account']],
    ['seller@example.com', ['Home', 'Orders', 'Products', 'Inbox', 'Account']],
    // A shop awaiting its first payment has the catalogue only.
    ['unpaid-seller@example.com', ['Home', 'Products', 'Account']],
  ])('%s sees %j', async (email, expected) => {
    await openApp();
    await signInOnScreen(email);
    await screen.findByRole('tab', { name: 'Home' });

    expect(tabs()).toEqual(expected);
  });

  it('opens a tab, and the tab is marked as the open one', async () => {
    await openApp();
    await signInOnScreen('admin@example.com');
    await screen.findByRole('tab', { name: 'Home' });

    await openTab('Orders');

    expect(await screen.findByRole('header', { name: 'Orders' })).toBeVisible();
    const orders = screen
      .getAllByRole('tab')
      .find((tab) => tab.props.accessibilityLabel === 'Orders');
    expect(orders?.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('does not open a hidden tab from a link: Home opens instead', async () => {
    await openApp();
    await signInOnScreen('unpaid-seller@example.com');
    await screen.findByText('This shop is awaiting its first payment');

    await goTo('/inbox');

    expect(screen.queryByRole('header', { name: 'Inbox' })).toBeNull();
    expect(await screen.findByText('This shop is awaiting its first payment')).toBeVisible();
  });

  it('keeps the screens above the tabs to their capability too', async () => {
    await openApp();
    await signInOnScreen('admin@example.com');
    await screen.findByText('Administrator');

    // An administrator reviews applications, and has no payouts of their own.
    await goTo('/more/applications');
    expect(await screen.findByRole('header', { name: 'Seller applications' })).toBeVisible();
    await goTo('/more/payouts');
    expect(screen.queryByRole('header', { name: 'Payouts' })).toBeNull();
  });

  it('lists in Account what the operator may open', async () => {
    await openApp();
    await signInOnScreen('seller@example.com');
    await screen.findByRole('tab', { name: 'Home' });

    await openTab('Account');

    expect(await screen.findByRole('button', { name: 'Payouts' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Seller applications' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeVisible();
  });
});
