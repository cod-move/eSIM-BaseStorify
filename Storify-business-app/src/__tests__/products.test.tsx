import type { InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { dropNextRequest } from '@/api/mocks/server';
import { queryClient } from '@/api/query-client';
import { WORKSPACE_QUERIES } from '@/api/query-keys';
import type { ProductList } from '@/contracts/mobile/biz/v1';

import './hooks';
import './preload-app';
import {
  openApp,
  openTab,
  press,
  settle,
  signInOnScreen,
  tap,
  type,
  wait,
  waitForSearch,
} from './screens';

async function openProducts(email = 'admin@example.com'): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await openTab('Products');
  await screen.findAllByRole('button', { name: /^Ceramic bud vase,|^Linen tea towel/ });
}

/** A product's row, by the start of what a screen reader says for it. */
const row = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name},`) });

/** How many products the list has read, over all its pages. */
function loaded(): number | undefined {
  const [, data] = queryClient
    .getQueriesData<InfiniteData<ProductList>>({ queryKey: WORKSPACE_QUERIES })
    .find(([key]) => key.includes('products') && key.includes('list')) ?? [null, undefined];
  return data?.pages.flatMap((page) => page.items).length;
}

/** Opens the filter sheet, by the start of its button's name (it says how many filters are on). */
async function openFilters(): Promise<void> {
  await tap(screen.getByRole('button', { name: /^Filter products/ }));
  await wait(400);
}

/** Chooses a radio row of the filter sheet, and lets it step back to the filters. */
async function choose(name: string): Promise<void> {
  await tap(screen.getByRole('radio', { name }));
  await settle();
}

/** Done: the filters go to the list, and the sheet slides out. */
async function done(): Promise<void> {
  await press('Done');
  await wait(400);
  await settle();
}

/** Scrolls to the end of the list. Twenty rows, 300 pt each in the tests (jest.setup.ts), in a 900 pt window. */
async function scrollToTheEnd(): Promise<void> {
  await fireEvent.scroll(screen.getByTestId('product-list'), {
    nativeEvent: {
      contentOffset: { x: 0, y: 5000 },
      contentSize: { width: 400, height: 6000 },
      layoutMeasurement: { width: 400, height: 900 },
    },
  });
  await settle();
}

/** Products: search, the filters (status, low stock, category, brand, collection), a page at a time. */
describe('Products', () => {
  it('shows a product as a row: price, codes, stock and status', async () => {
    await openProducts();

    expect(row('Ceramic bud vase')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Ceramic bud vase, $24.00, VASE-01, 24 in stock, Active',
      })
    ).toBeVisible();
    // A seller's product shows its seller to the store's own operators, its variants' price range.
    expect(
      screen.getByRole('button', {
        name: 'Stoneware mug, Green Leaf Goods, $16.00 – $18.00, 3 variants, 19 in stock, Active',
      })
    ).toBeVisible();
  });

  it('searches by name or SKU once typing pauses', async () => {
    await openProducts();

    await type('Name or SKU', 'mug');
    await waitForSearch();
    expect(row('Stoneware mug')).toBeVisible();
    expect(row('Ceramic bud vase')).toBeNull();

    await type('Name or SKU', 'TOTE-CNV');
    await waitForSearch();
    expect(row('Canvas tote bag')).toBeVisible();

    await type('Name or SKU', 'teapot');
    await waitForSearch();
    expect(await screen.findByText('Nothing matches “teapot”')).toBeVisible();
  });

  it('filters by status and by low stock in the filter sheet, each filter on as a chip', async () => {
    await openProducts();

    await openFilters();
    await press('Status, All statuses');
    await choose('Draft');
    await done();
    expect(row('Hanging planter')).toBeVisible();
    expect(row('Seagrass basket')).toBeVisible();
    expect(row('Ceramic bud vase')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter products, 1 filter on' })).toBeVisible();

    await openFilters();
    await press('Status, Draft');
    await choose('All statuses');
    await press('Stock, All stock levels');
    await choose('Low stock');
    await done();
    expect(row('Linen tea towel \\(set of 2\\)')).toBeVisible();
    expect(row('Waxed field jacket')).toBeVisible();
    expect(row('Hanging planter')).toBeNull();

    // The chip's cross takes the filter off.
    await press('Remove filter: Low stock');
    await settle();
    expect(row('Ceramic bud vase')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Remove filter/ })).toBeNull();
  });

  it('steps down the category tree, and narrows by a brand and a collection too', async () => {
    await openProducts();

    await openFilters();
    await press('Category, All categories');
    // Home & living has categories under it: it opens them, with a back button.
    await press('Home & living');
    expect(screen.getByRole('header', { name: 'Home & living' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Kitchen' })).toBeOnTheScreen();
    await press('Back');
    await press('Home & living');
    await choose('Kitchen');
    expect(screen.getByRole('button', { name: 'Category, Kitchen' })).toBeOnTheScreen();
    await done();
    expect(row('Linen tea towel \\(set of 2\\)')).toBeVisible();
    expect(row('Stoneware mug')).toBeVisible();
    expect(row('Ceramic bud vase')).toBeNull();

    // "All of Home & living" takes the whole branch.
    await openFilters();
    await press('Category, Kitchen');
    await press('Home & living, Kitchen');
    await choose('All of Home & living');
    await press('Brand, All brands');
    await choose('Studio');
    await done();
    expect(row('Ceramic bud vase')).toBeVisible();
    expect(row('Stoneware mug')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove filter: Home & living' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove filter: Studio' })).toBeVisible();

    // Nothing in Home & living from Studio is a bestseller but the vase; nothing is in the archive.
    await openFilters();
    await press('Collection, All collections');
    await choose('Bestsellers');
    await done();
    expect(row('Ceramic bud vase')).toBeVisible();

    await tap(screen.getByRole('link', { name: 'Clear all' }));
    await settle();
    expect(row('Stoneware mug')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Filter products' })).toBeVisible();
  });

  it('opens on the low-stock list from a low-stock alert', async () => {
    await openApp();
    await signInOnScreen('seller@example.com');
    await act(async () => router.navigate({ pathname: '/products', params: { lowStock: 'true' } }));
    await settle();

    expect(await screen.findByRole('button', { name: 'Remove filter: Low stock' })).toBeVisible();
    expect(row('Linen tea towel \\(set of 2\\)')).toBeVisible();
    expect(row('Beeswax pillar candle')).toBeNull();
  });

  it('drops a search left from before when a low-stock alert opens the list', async () => {
    await openProducts();
    await type('Name or SKU', 'vase');
    await waitForSearch();
    expect(row('Linen tea towel \\(set of 2\\)')).toBeNull();

    await act(async () => router.navigate({ pathname: '/products', params: { lowStock: 'true' } }));
    await settle();
    await waitForSearch();

    expect(screen.getByLabelText('Name or SKU').props.value).toBe('');
    expect(await screen.findByRole('button', { name: 'Remove filter: Low stock' })).toBeVisible();
    expect(row('Linen tea towel \\(set of 2\\)')).toBeVisible();
  });

  it('reads the next page when the end of the list comes near', async () => {
    await openProducts();
    expect(loaded()).toBe(20);

    await scrollToTheEnd();
    expect(loaded()).toBe(28);
  });

  it('says when the next page could not be read, keeps the rows, and reads it on Try again', async () => {
    await openProducts();

    // The next page, and the two tries after it, never reach the store.
    dropNextRequest(3, { method: 'GET', path: /\/products$/ });
    await scrollToTheEnd();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(6000);
    });
    expect(
      await screen.findByText('Please check your internet connection and try again.')
    ).toBeVisible();
    expect(screen.getByTestId('product-list')).toBeVisible();
    expect(loaded()).toBe(20);

    await tap(screen.getByRole('link', { name: 'Try again' }));
    await settle();
    expect(loaded()).toBe(28);
    expect(screen.queryByText('Please check your internet connection and try again.')).toBeNull();
  });

  it('opens a product from its row: prices, codes and units per location', async () => {
    await openProducts();
    await tap(row('Ceramic bud vase')!);
    await settle();

    expect(await screen.findByRole('header', { name: 'Ceramic bud vase' })).toBeVisible();
    expect(screen.getByText('SKU VASE-01 · Barcode 4006381333931')).toBeVisible();
    expect(screen.getByLabelText('Price, $24.00')).toBeVisible();
    expect(screen.getByLabelText('Compare-at price, None')).toBeVisible();
    expect(screen.getByLabelText('Main warehouse, 18 available')).toBeVisible();
    expect(screen.getByLabelText('City pop-up, 6 available')).toBeVisible();
  });
});
