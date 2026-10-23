import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as productEndpoints from '@/api/endpoints/products';
import { ApiError } from '@/api/errors';
import { loseNextAnswer } from '@/api/mocks/server';

import './hooks';
import './preload-app';
import { openApp, press, settle, signInOnScreen, tap, type, wait } from './screens';

async function openStock(email: string, id: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await act(async () => router.push({ pathname: '/products/[id]/stock', params: { id } }));
  await settle();
  await screen.findByRole('header', { name: 'Stock' });
}

/** The four figures of the product's (only) stock row, as a screen reader says them. */
const figures = () => String(screen.getByLabelText(/^Available /).props.accessibilityLabel);

const NO_ANSWER =
  "The store didn't answer, so this may have been saved. Try again: it won't be counted twice.";

/** Opens Add at the seller's studio, asks for 5 units, received. */
async function addFiveReceived(): Promise<void> {
  await press('Add units at Green Leaf studio');
  await wait(400);
  await type('Units', '5');
  await tap(screen.getByRole('radio', { name: 'Received' }));
}

/**
 * Stock: available, committed, unavailable and on hand; units
 * added or removed with a reason, one `Idempotency-Key` per tap, the figures
 * taken from the store's answer.
 */
describe('stock', () => {
  it('shows the four figures and the units at each location', async () => {
    await openStock('seller@example.com', 'prod_towel');

    expect(figures()).toBe('Available 3, Committed 1, Unavailable 0, On hand 4');
    expect(screen.getByLabelText('Green Leaf studio, 3 available')).toBeVisible();
    expect(screen.getByText('Counts as low at 10 units or fewer')).toBeVisible();
  });

  it('adds units with a reason, and shows what the store answered', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await press('Add units at Green Leaf studio');
    await wait(400);

    // A reason first.
    expect(screen.getByRole('button', { name: 'Add 1 unit' })).toBeDisabled();
    await type('Units', '5');
    await tap(screen.getByRole('radio', { name: 'Received' }));
    await press('Add 5 units');
    await settle();

    expect(await screen.findByText('Added 5 units at Green Leaf studio')).toBeVisible();
    expect(figures()).toBe('Available 8, Committed 1, Unavailable 0, On hand 9');
  });

  it('retries an answer lost on the way back with the same key, and counts it once', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await addFiveReceived();

    loseNextAnswer();
    await press('Add 5 units');
    // The tap's own retry comes a second later.
    await wait(1500);

    expect(await screen.findByText('Added 5 units at Green Leaf studio')).toBeVisible();
    expect(figures()).toBe('Available 8, Committed 1, Unavailable 0, On hand 9');
  });

  it('when no answer comes at all, sends the same change again on the next tap, counted once', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await addFiveReceived();

    // The change is made, and none of the tap's three tries hears back.
    loseNextAnswer(3);
    await press('Add 5 units');
    await wait(3500);

    expect(await screen.findByText(NO_ANSWER)).toBeOnTheScreen();
    // The stock is read again: the screen shows what the store holds, the change made.
    await settle();
    expect(figures()).toBe('Available 8, Committed 1, Unavailable 0, On hand 9');

    await press('Try again');
    await settle();
    expect(await screen.findByText('Added 5 units at Green Leaf studio')).toBeVisible();
    expect(figures()).toBe('Available 8, Committed 1, Unavailable 0, On hand 9');

    // And the store counted it once.
    await act(async () =>
      router.push({ pathname: '/products/[id]', params: { id: 'prod_towel' } })
    );
    await settle();
    expect(await screen.findByLabelText('Green Leaf studio, 8 available')).toBeVisible();
  });

  it('counts the same units again in a new opening of the sheet, after one that got no answer', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await addFiveReceived();
    loseNextAnswer(3);
    await press('Add 5 units');
    await wait(3500);
    expect(await screen.findByText(NO_ANSWER)).toBeOnTheScreen();

    // Given up: the operator sees the five went in, and later counts five more in.
    await press('Cancel');
    await wait(400);
    expect(figures()).toBe('Available 8, Committed 1, Unavailable 0, On hand 9');
    await addFiveReceived();
    await press('Add 5 units');
    await settle();

    expect(await screen.findByText('Added 5 units at Green Leaf studio')).toBeVisible();
    expect(figures()).toBe('Available 13, Committed 1, Unavailable 0, On hand 14');
  });

  it('when the connection drops between the tries, says the change may have been made', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await addFiveReceived();

    // The first try is made by the store, its answer lost; then the phone goes offline.
    loseNextAnswer(3);
    await press('Add 5 units');
    await act(async () => onlineManager.setOnline(false));
    try {
      await wait(3500);
      expect(await screen.findByText(NO_ANSWER)).toBeOnTheScreen();
      expect(screen.queryByText("You're offline. Nothing was sent.")).toBeNull();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }

    await press('Try again');
    await settle();
    expect(await screen.findByText('Added 5 units at Green Leaf studio')).toBeVisible();
    expect(figures()).toBe('Available 8, Committed 1, Unavailable 0, On hand 9');
  });

  it('after a server fault, keeps the sheet to the same change and its key, counted once', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await addFiveReceived();

    // The store counts the units, and the answer comes back as a server fault.
    const original = productEndpoints.adjustStock;
    const send = jest
      .spyOn(productEndpoints, 'adjustStock')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new ApiError(502, 'INTERNAL_ERROR', '');
      });
    try {
      await press('Add 5 units');
      await settle();

      expect(await screen.findByText(NO_ANSWER)).toBeOnTheScreen();
      // The units can't be changed into another change that would count again.
      expect(screen.getAllByLabelText('Units').at(-1)!.props.editable).toBe(false);
      expect(screen.queryByRole('button', { name: 'Add 5 units' })).toBeNull();

      await press('Try again');
      await settle();
      expect(await screen.findByText('Added 5 units at Green Leaf studio')).toBeVisible();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]![3]).toBe(send.mock.calls[0]![3]);
      expect(send.mock.calls[1]![2]).toEqual(send.mock.calls[0]![2]);
      expect(figures()).toBe('Available 8, Committed 1, Unavailable 0, On hand 9');
    } finally {
      send.mockRestore();
    }
  });

  it('removes units, and says first that stock does not go below zero', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await press('Remove units at Green Leaf studio');
    await wait(400);

    await type('Units', '5');
    expect(
      screen.getByText("Only 3 are available here. Stock doesn't go below 0.")
    ).toBeOnTheScreen();
    await tap(screen.getByRole('radio', { name: 'Damaged' }));
    await press('Remove 5 units');
    await settle();

    expect(await screen.findByText('Removed 5 units at Green Leaf studio')).toBeVisible();
    expect(figures()).toBe('Available 0, Committed 1, Unavailable 0, On hand 1');
  });

  it('counts a variant at its own location', async () => {
    await openStock('seller@example.com', 'prod_mug');

    const adds = screen.getAllByRole('button', { name: 'Add units at Green Leaf studio' });
    expect(adds).toHaveLength(3);
    // Sand, the second variant: none available.
    await tap(adds[1]!);
    await wait(400);
    expect(screen.getByText('Sand at Green Leaf studio · 0 available now')).toBeOnTheScreen();
    await tap(screen.getByRole('radio', { name: 'Stock count' }));
    await press('Add 1 unit');
    await settle();

    expect(await screen.findByText('Added 1 unit at Green Leaf studio')).toBeVisible();
    expect(screen.getAllByLabelText('Green Leaf studio, 1 available')).toHaveLength(1);
  });

  it('sends nothing while offline, and says so', async () => {
    await openStock('seller@example.com', 'prod_towel');
    await addFiveReceived();

    onlineManager.setOnline(false);
    try {
      await press('Add 5 units');
      await settle();
      expect(await screen.findByText("You're offline. Nothing was sent.")).toBeVisible();
      expect(figures()).toBe('Available 3, Committed 1, Unavailable 0, On hand 4');
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('shows the figures, without Add and Remove, to staff who may only look', async () => {
    await openStock('staff@example.com', 'prod_vase');

    expect(figures()).toBe('Available 24, Committed 3, Unavailable 1, On hand 28');
    expect(screen.getByLabelText('Main warehouse, 18 available')).toBeVisible();
    expect(screen.getByLabelText('City pop-up, 6 available')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Add units/ })).toBeNull();
  });

  it('says when stock is not counted for a product', async () => {
    await openStock('admin@example.com', 'prod_guide');

    expect(screen.getByText("Stock isn't counted for this product")).toBeVisible();
  });
});
