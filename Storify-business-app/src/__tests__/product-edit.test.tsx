import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as productEndpoints from '@/api/endpoints/products';
import { changeMockProduct } from '@/api/mocks/routes/products';
import { loseNextAnswer } from '@/api/mocks/server';

import './hooks';
import './preload-app';
import { openApp, press, settle, signInOnScreen, tap, type } from './screens';

async function openProduct(email: string, id: string, name: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await act(async () => router.push({ pathname: '/products/[id]', params: { id } }));
  await settle();
  await screen.findByRole('header', { name });
}

/** Lets a sheet finish sliding in or out. */
async function sheetMoves(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
}

async function openEdit(): Promise<void> {
  await press('Edit');
  await sheetMoves();
  await screen.findByRole('header', { name: 'Edit product' });
}

async function save(): Promise<void> {
  await press('Save');
  await settle();
  await sheetMoves();
}

const priceField = () => screen.getByLabelText('Price');

const NO_ANSWER = "The store didn't answer, so this may have been saved. Save again to be sure.";

/**
 * The connection drops while the next save is on its way: the store makes the
 * change, and the phone is offline by the time it hears nothing back.
 */
function dropConnectionDuringSave() {
  const send = productEndpoints.updateProduct;
  return jest.spyOn(productEndpoints, 'updateProduct').mockImplementationOnce(async (...args) => {
    loseNextAnswer();
    try {
      return await send(...args);
    } finally {
      onlineManager.setOnline(false);
    }
  });
}

/**
 * The quick edit of a product: price, compare-at price, status and
 * variant prices, sent with `If-Match`; a 412 reads the product again and
 * shows what changed.
 */
describe('editing a product', () => {
  it('saves a price and a status, and shows them from the store’s answer', async () => {
    await openProduct('admin@example.com', 'prod_vase', 'Ceramic bud vase');
    await openEdit();

    await type('Price', '26.50');
    await type('Compare-at price, Optional', '32');
    await tap(screen.getByRole('radio', { name: 'Unlisted' }));
    await save();

    expect(await screen.findByText('Changes saved')).toBeVisible();
    expect(screen.getByLabelText('Price, $26.50')).toBeVisible();
    expect(screen.getByLabelText('Compare-at price, $32.00')).toBeVisible();
    expect(screen.getAllByText('Unlisted').length).toBeGreaterThan(0);
  });

  it('after somebody else changed the price, shows theirs and what changed, and saves on the operator’s word', async () => {
    await openProduct('admin@example.com', 'prod_vase', 'Ceramic bud vase');
    await openEdit();
    await type('Price', '30');

    // Another operator saves a new price while this one is typing.
    changeMockProduct('prod_vase', (product) => {
      product.price = 26;
    });
    await save();

    // Inside the sheet, which fades in on the native driver: on the screen, never "visible" here.
    expect(await screen.findByText('Someone else changed this product')).toBeOnTheScreen();
    expect(screen.getByText(/Price: \$24\.00 → \$26\.00/)).toBeOnTheScreen();
    expect(priceField().props.value).toBe('26');
    expect(screen.queryByText('Changes saved')).toBeNull();
    // The page under the sheet shows the product as it is now.
    expect(screen.getByLabelText('Price, $26.00')).toBeOnTheScreen();

    await type('Price', '30');
    await save();
    expect(await screen.findByText('Changes saved')).toBeVisible();
    expect(screen.getByLabelText('Price, $30.00')).toBeVisible();
  });

  it('saves without asking when only something else moved the version (a sale)', async () => {
    await openProduct('admin@example.com', 'prod_vase', 'Ceramic bud vase');
    await openEdit();
    await type('Price', '30');

    changeMockProduct('prod_vase', (product) => {
      const shelf = product.stock.loc_main;
      if (shelf) shelf.available -= 1;
    });
    await save();

    expect(await screen.findByText('Changes saved')).toBeVisible();
    expect(screen.queryByText('Someone else changed this product')).toBeNull();
    expect(screen.getByLabelText('Price, $30.00')).toBeVisible();
  });

  it('after a save that got no answer, shows the product as the store holds it, and blames nobody for it', async () => {
    await openProduct('admin@example.com', 'prod_vase', 'Ceramic bud vase');
    await openEdit();
    await type('Price', '30');

    // Saved by the store; its answer never arrives.
    loseNextAnswer();
    await save();
    expect(await screen.findByText(NO_ANSWER)).toBeVisible();
    // The page under the sheet is read again.
    expect(screen.getByLabelText('Price, $30.00')).toBeOnTheScreen();

    await press('Close');
    await sheetMoves();
    await openEdit();
    await type('Price', '32');
    await save();

    expect(await screen.findByText('Changes saved')).toBeVisible();
    expect(screen.queryByText('Someone else changed this product')).toBeNull();
    expect(screen.getByLabelText('Price, $32.00')).toBeVisible();
  });

  it('says a save may have gone through when the connection drops on its way', async () => {
    await openProduct('admin@example.com', 'prod_vase', 'Ceramic bud vase');
    await openEdit();
    await type('Price', '30');

    const drop = dropConnectionDuringSave();
    try {
      await save();
      expect(await screen.findByText(NO_ANSWER)).toBeVisible();
      expect(screen.queryByText("You're offline. Nothing was sent.")).toBeNull();
    } finally {
      drop.mockRestore();
      await act(async () => onlineManager.setOnline(true));
    }
  });

  it('sends nothing while offline, and says so', async () => {
    await openProduct('admin@example.com', 'prod_vase', 'Ceramic bud vase');
    await openEdit();
    await type('Price', '30');

    await act(async () => onlineManager.setOnline(false));
    try {
      await save();
      expect(await screen.findByText("You're offline. Nothing was sent.")).toBeVisible();
      expect(screen.getByLabelText('Price, $24.00')).toBeOnTheScreen();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });

  it('prices a product with variants per variant', async () => {
    await openProduct('seller@example.com', 'prod_mug', 'Stoneware mug');
    await openEdit();
    expect(screen.queryByLabelText('Price')).toBeNull();

    await type('Sage, Price', '17');
    await type('Charcoal, Compare-at price', '');
    await save();

    expect(await screen.findByText('Changes saved')).toBeVisible();
    expect(screen.getByLabelText('Sage, $17.00, MUG-SAGE, 12 in stock')).toBeVisible();
    expect(screen.getByLabelText('Charcoal, $18.00, MUG-CHAR, 7 in stock')).toBeVisible();
  });

  it('says what is wrong with a price before sending anything', async () => {
    await openProduct('admin@example.com', 'prod_vase', 'Ceramic bud vase');
    await openEdit();

    await type('Price', '');
    await save();
    expect(screen.getByText('Enter a price.')).toBeOnTheScreen();

    await type('Price', '12,5,0x');
    expect(screen.getByText('Enter a price of 0 or more, like 12.50.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Price, $24.00')).toBeOnTheScreen();
  });

  it('leaves the prices of a “price on request” product to the website', async () => {
    await openProduct('admin@example.com', 'prod_jacket', 'Waxed field jacket');
    await openEdit();

    expect(
      screen.getByText(
        'Shoppers see “price on request” for this product, so its prices are changed on the website.'
      )
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Price')).toBeNull();
  });

  it('offers no edit to staff who may only look', async () => {
    await openProduct('staff@example.com', 'prod_vase', 'Ceramic bud vase');

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stock' })).toBeVisible();
  });
});
