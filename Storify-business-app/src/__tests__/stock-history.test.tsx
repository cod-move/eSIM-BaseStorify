import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import './hooks';
import './preload-app';
import { openApp, press, settle, signInOnScreen, tap } from './screens';

/** Signs in as `email` and opens the product's stock. */
async function openStock(email: string, id: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await act(async () => router.push({ pathname: '/products/[id]/stock', params: { id } }));
  await settle();
  await screen.findByRole('header', { name: 'Stock' });
}

/** Opens the history from the stock screen's header. */
async function openHistory(): Promise<void> {
  await press('Stock history');
  await settle();
  await screen.findByRole('header', { name: 'Stock history' });
}

/** The movements drawn now, as a screen reader says them, newest first. */
function shown(): string[] {
  return screen
    .queryAllByLabelText(/, \d+ units? (in|out), /)
    .map((row) => String(row.props.accessibilityLabel));
}

/**
 * Every movement of the list, scrolling down it: a list draws a screen's
 * worth of rows at a time (jest.setup.ts gives each row 300 pt in a 900 pt
 * window).
 */
async function everyMovement(): Promise<string[]> {
  const seen: string[] = [];
  for (let offset = 0; offset <= 6000; offset += 600) {
    await fireEvent.scroll(screen.getByTestId('stock-history'), {
      nativeEvent: {
        contentOffset: { x: 0, y: offset },
        contentSize: { width: 400, height: 6600 },
        layoutMeasurement: { width: 400, height: 900 },
      },
    });
    await settle();
    for (const row of shown()) if (!seen.includes(row)) seen.push(row);
  }
  return seen;
}

/** The day headings drawn now. */
function days(): string[] {
  return screen
    .getAllByRole('header')
    .map((header) => String(header.props.children ?? ''))
    .filter((name) => name !== '' && name !== 'Stock history' && name !== 'Stock');
}

/**
 * A product's stock history: what moved its stock as
 * the store records it, under a heading per day, narrowed by location; a
 * staff member assigned to one location sees that location's movements only.
 */
describe('stock history', () => {
  it('opens from the stock screen: what moved the stock, by day, newest first', async () => {
    await openStock('admin@example.com', 'prod_vase');
    await openHistory();

    // What happened, the units, where, the count after, when and who, the note.
    const first = shown();
    expect(first[0]).toMatch(
      /^Received, 6 units in, Main warehouse, 18 after, .+ · Amina Rahman · Administrator, “Kiln delivery, batch 14”$/
    );
    expect(first[2]).toMatch(
      /^Sent on a transfer, 4 units out, Main warehouse, .+ · Tania Akter · Staff · Transfer TR-1042$/
    );
    // Two hours ago and a day ago: two days, each under its heading.
    expect(days().length).toBeGreaterThanOrEqual(2);

    const rows = await everyMovement();
    expect(rows).toHaveLength(9);
    expect(rows).toContainEqual(
      expect.stringMatching(/^Return put back on sale, 1 unit in, No location recorded, /)
    );
    expect(rows).toContainEqual(
      expect.stringMatching(/^Count set, 2 units out, Main warehouse, 16 after, /)
    );
    // Sales are not movements the store records: the end of the list says so.
    expect(screen.getByText(/Sales, cancelled orders and refunds move stock too/)).toBeVisible();
  });

  it('narrows to one location', async () => {
    await openStock('admin@example.com', 'prod_vase');
    await openHistory();
    expect(shown().some((row) => row.includes('Main warehouse'))).toBe(true);

    await tap(screen.getByRole('tab', { name: 'City pop-up' }));
    await settle();

    const rows = await everyMovement();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.includes('City pop-up'))).toBe(true);
  });

  it('shows a staff member assigned to one location only the movements there', async () => {
    await openStock('warehouse@example.com', 'prod_vase');
    // The stock screen already shows their warehouse only.
    expect(screen.getByLabelText('Main warehouse, 18 available')).toBeVisible();
    expect(screen.queryByLabelText(/^City pop-up/)).toBeNull();
    await openHistory();

    // One location is nothing to choose between.
    expect(screen.queryByRole('tab', { name: 'All locations' })).toBeNull();
    const rows = await everyMovement();
    expect(rows).toHaveLength(5);
    // Nothing at the pop-up, and nothing recorded without a location.
    expect(rows.every((row) => row.includes('Main warehouse'))).toBe(true);
  });

  it("says when nothing moved a product's stock yet", async () => {
    await openStock('seller@example.com', 'prod_candle');
    await openHistory();

    expect(await screen.findByText('No stock history yet')).toBeVisible();
    expect(shown()).toEqual([]);
  });
});
