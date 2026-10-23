import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { mockCustomerNotes } from '@/api/mocks/routes/customers';
import { loseNextAnswer } from '@/api/mocks/server';

import './hooks';
import './preload-app';
import { currentPath, openTab, press, settle, signIn, tap, type, wait } from './screens';

// Each test signs in and walks through several screens.
jest.setTimeout(20_000);

/** Opens a screen above the tabs, as a link would. */
async function open(pathname: string, params: Record<string, string>): Promise<void> {
  await act(async () => router.push({ pathname: pathname as never, params }));
  await settle();
}

const openCustomer = (id: string) => open('/customers/[id]', { id });

/** The rows of orders on screen, by their number. */
const orderRows = () =>
  screen
    .queryAllByLabelText(/^Order \d+,/)
    .map((row) => String(row.props.accessibilityLabel).split(',')[0]);

/** Customers: the list, a profile with its figures and notes, and the ways in. */
describe('customers', () => {
  it('finds a customer from the Account tab and opens their profile', async () => {
    await signIn('admin@example.com');
    await openTab('Account');
    await press('Customers');
    await settle();
    expect(currentPath()).toBe('/customers');
    expect(await screen.findByRole('button', { name: /^Rina Begum, .*1 order$/ })).toBeVisible();

    await type('Name, email or phone', 'amina');
    await wait(400);
    await settle();
    expect(screen.queryByRole('button', { name: /^Rina Begum,/ })).toBeNull();
    await tap(screen.getByRole('button', { name: /^Amina Customer,.*No orders$/ }));
    await settle();

    expect(currentPath()).toBe('/customers/cus_amina');
    expect(await screen.findByRole('header', { name: 'Amina Customer' })).toBeVisible();
    expect(screen.getByText('amina.customer@example.com')).toBeVisible();
    expect(screen.getByText('Addresses')).toBeVisible();
    expect(screen.getByText('12 Lake Road')).toBeVisible();
    expect(screen.getByText('Nothing paid yet')).toBeVisible();
  });

  it("shows the store's figures, the latest orders and conversations, and the notes", async () => {
    await signIn('admin@example.com');
    await openCustomer('cus_rina');
    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
    expect(screen.getByLabelText(/^Orders, 1, Spent, \$53\.45, First order /)).toBeVisible();
    expect(orderRows()).toEqual(['Order 1041']);
    expect(screen.getByText('Ceramic bud vase')).toBeVisible();

    expect(screen.getByRole('header', { name: 'Notes' })).toBeVisible();
    expect(
      screen.getByLabelText(
        /^Note · Amina Rahman, Only your team sees this note\., Administrator · /
      )
    ).toBeVisible();
    // The seller's own notes about her stay theirs.
    expect(screen.queryByText(/Buys candles for her shop/)).toBeNull();
  });

  it('adds a note, once, even when the first answer never comes', async () => {
    await signIn('admin@example.com');
    await openCustomer('cus_rina');
    await screen.findByRole('header', { name: 'Rina Begum' });

    await press('Add note');
    await settle();
    expect(await screen.findByText('Add a note')).toBeOnTheScreen();
    await type('Note', 'Wants the sage vase when it is back.');

    // The note is saved, and none of the tap's three tries hears back.
    loseNextAnswer(3);
    await press('Save note');
    await wait(3500);
    expect(
      await screen.findByText(
        "The store didn't answer, so the note may be saved already. Try again: it won't be saved twice."
      )
    ).toBeOnTheScreen();
    await press('Try again');
    await settle();

    expect(await screen.findByText('Note saved')).toBeVisible();
    expect(screen.getByText('Wants the sage vase when it is back.')).toBeVisible();
    expect(
      mockCustomerNotes().filter((note) => note.body === 'Wants the sage vase when it is back.')
    ).toEqual([expect.objectContaining({ business: 'platform', customerId: 'cus_rina' })]);
  });

  it('shows a seller only their part of a customer, and only their orders', async () => {
    await signIn('seller@example.com');
    await openCustomer('cus_rina');
    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
    // Their candles, not the store's vase on the same order.
    expect(screen.getByLabelText(/^Orders, 1, Spent, \$25\.00, /)).toBeVisible();
    expect(
      screen.getByText('Buys candles for her shop. Ask before sending a substitute.')
    ).toBeVisible();
    expect(screen.queryByText(/Prefers delivery after 6 pm/)).toBeNull();

    await press('See all their orders');
    await settle();
    expect(currentPath()).toBe('/customers/cus_rina/orders');
    expect(await screen.findByRole('header', { name: 'Their orders' })).toBeVisible();
    expect(orderRows()).toEqual(['Order 1041']);

    // A regular of the store's own goods is not the seller's customer.
    await openCustomer('cus_laila');
    expect(
      await screen.findByText(
        "We couldn't find that. It may have been removed, or it's outside what you can see."
      )
    ).toBeVisible();
  });

  it("keeps the notes from a seller's staff who may not keep them", async () => {
    await signIn('seller-staff@example.com');
    await openCustomer('cus_omar');
    expect(await screen.findByRole('header', { name: 'Omar Faruk' })).toBeVisible();
    expect(orderRows()).toEqual(['Order 1040']);
    expect(screen.queryByRole('header', { name: 'Notes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    expect(screen.queryByText(/Moved to Chattogram/)).toBeNull();
  });

  it('opens the customer of a conversation from its header', async () => {
    await signIn('admin@example.com');
    await open('/conversations/[id]', { id: 'conv_store_1' });
    await press('View profile');
    await settle();

    expect(currentPath()).toBe('/customers/cus_rina');
    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
    expect(screen.getByText('rina@example.com')).toBeVisible();
  });

  it('opens the customer of an order from its customer section', async () => {
    await signIn('admin@example.com');
    await open('/orders/[id]', { id: 'ord_1041' });
    await press('View profile');
    await settle();

    expect(currentPath()).toBe('/customers/cus_rina');
    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
  });

  it('keeps the list from staff who may not see customers', async () => {
    await signIn('staff@example.com');
    await openTab('Account');
    expect(screen.queryByRole('button', { name: 'Customers' })).toBeNull();
  });
});
