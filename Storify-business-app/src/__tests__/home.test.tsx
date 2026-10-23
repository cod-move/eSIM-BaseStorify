import { act, screen } from '@testing-library/react-native';

import { changeMockOrder } from '@/api/mocks/routes/orders';
import * as homeEndpoints from '@/api/endpoints/home';
import * as inboxEndpoints from '@/api/endpoints/inbox';
import * as ordersEndpoints from '@/api/endpoints/orders';
import { onlineManager } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';

import './hooks';
import './preload-app';
import {
  openApp,
  openTab,
  press,
  pullToRefresh,
  settle,
  signInOnScreen,
  tap,
  type,
} from './screens';

/** The names of Home's tiles, without their figures ("Open returns, 1" → "Open returns"). */
const TILES = [
  'Collected today',
  'Collected this month',
  'Orders needing action',
  'Unread messages',
  'Low on stock',
  'Open returns',
];

function tileNames(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel ?? '').split(',')[0] ?? '')
    .filter((name) => TILES.includes(name));
}

async function openHomeAs(email: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
}

/**
 * Home's tiles: the store's figures, each shown only with the
 * capability of the list it counts, each opening that list; read again on
 * pull to refresh.
 */
describe('Home', () => {
  it('shows a top collection graph and bounded previews without reading messages', async () => {
    const orders = jest.spyOn(ordersEndpoints, 'getOrders');
    const conversations = jest.spyOn(inboxEndpoints, 'getConversations');
    const markRead = jest.spyOn(inboxEndpoints, 'markConversationRead');
    try {
      await openHomeAs('admin@example.com');
      expect(await screen.findByText('Last 7 days')).toBeVisible();
      expect(await screen.findByRole('header', { name: 'Orders to process' })).toBeVisible();
      expect(await screen.findByRole('header', { name: 'Unread conversations' })).toBeVisible();
      await settle();
      expect(orders).toHaveBeenCalledWith(
        expect.objectContaining({ workspace: 'platform' }),
        { tab: 'needs_action', limit: 3 },
        expect.anything()
      );
      expect(conversations).toHaveBeenCalledWith(
        expect.objectContaining({ workspace: 'platform' }),
        { unreadOnly: true, limit: 2 },
        expect.anything()
      );
      expect(markRead).not.toHaveBeenCalled();
    } finally {
      orders.mockRestore();
      conversations.mockRestore();
      markRead.mockRestore();
    }
  });

  it('opens unread messages without a previous inbox search', async () => {
    await openHomeAs('admin@example.com');
    await openTab('Inbox');
    await type('Name, email, phone or subject', 'no-match');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    await settle();
    await openTab('Home');
    await tap(await screen.findByRole('button', { name: /^Unread messages, \d+$/ }));
    expect(await screen.findByText('Showing: Unread')).toBeVisible();
    expect(screen.getByLabelText('Name, email, phone or subject')).toHaveDisplayValue('');
  });

  it('keeps the work queues when only the order preview fails', async () => {
    const preview = jest
      .spyOn(ordersEndpoints, 'getOrders')
      .mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Not allowed'));
    try {
      await openHomeAs('admin@example.com');
      expect(
        await screen.findByRole('button', { name: /^Orders needing action, \d+$/ })
      ).toBeVisible();
      expect(await screen.findByText('Last 7 days')).toBeVisible();
      expect(await screen.findByText('Not allowed')).toBeVisible();
      expect(screen.getByRole('link', { name: 'Try again' })).toBeVisible();
    } finally {
      preview.mockRestore();
    }
  });

  it('shows an offline notice, with when Home was last read, while keeping loaded figures', async () => {
    await openHomeAs('admin@example.com');
    await screen.findByRole('button', { name: /^Orders needing action, \d+$/ });
    expect(screen.queryByText(/^Checked /)).toBeNull();
    await act(() => onlineManager.setOnline(false));
    try {
      expect(
        screen.getByText("You're offline. Already loaded data may be out of date.")
      ).toBeVisible();
      expect(screen.getByText(/^Checked /)).toBeVisible();
      expect(screen.getByText('Last 7 days')).toBeVisible();
    } finally {
      await act(() => onlineManager.setOnline(true));
    }
  });

  it("draws a bar for each of the store's days, and tells a tapped day's amount", async () => {
    await openHomeAs('admin@example.com');
    const days = await screen.findAllByRole('button', { name: /, collected \$[\d,.]+$/ });
    expect(days).toHaveLength(7);
    const first = days[0]!;
    const amount = String(first.props.accessibilityLabel).split('collected ')[1] ?? '';

    await tap(first);
    expect(screen.queryByText('Last 7 days')).toBeNull();
    const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(screen.getByText(new RegExp(` · ${escaped}$`))).toBeVisible();
    expect(first).toBeSelected();

    // Tapped again, the graph goes back to the week.
    await tap(first);
    expect(screen.getByText('Last 7 days')).toBeVisible();
  });

  it('hides its amounts behind the eye, remembered on the phone, and shows them again', async () => {
    await openHomeAs('admin@example.com');
    const today = await screen.findByRole('button', { name: /^Collected today, \$[\d,.]+$/ });
    const amount = String(today.props.accessibilityLabel).split(', ')[1]!;
    // The same amount can also be an order's total in the preview below.
    const shown = screen.getAllByText(amount).length;

    await press('Hide amounts');
    expect(screen.queryAllByText(amount)).toHaveLength(shown - 1);
    expect(screen.getByRole('button', { name: 'Collected today, ••••••' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Collected this month, ••••••' })).toBeVisible();
    expect(localStorage.getItem('storifybiz.home-amounts-hidden')).toBe('1');

    await press('Show amounts');
    expect(screen.getAllByText(amount)).toHaveLength(shown);
  });

  it('says the graph needs a newer store when the store sends no trend, and draws no days', async () => {
    const getHome = homeEndpoints.getHome;
    const older = jest
      .spyOn(homeEndpoints, 'getHome')
      .mockImplementation(async (scope, options) => {
        const result = await getHome(scope, options);
        if (result.notModified) return result;
        const { collectionTrend: _, ...data } = result.data;
        return { ...result, data };
      });
    try {
      await openHomeAs('admin@example.com');
      expect(
        await screen.findByText('This graph needs a newer version of the store.')
      ).toBeVisible();
      expect(screen.getByRole('button', { name: /^Collected today, \$[\d,.]+$/ })).toBeVisible();
      expect(screen.queryAllByRole('button', { name: /, collected \$/ })).toHaveLength(0);
    } finally {
      older.mockRestore();
    }
  });
  it("shows an administrator the store's tiles, in the store's order, with their figures", async () => {
    await openHomeAs('admin@example.com');

    expect(
      await screen.findByRole('button', { name: /^Orders needing action, \d+$/ })
    ).toBeVisible();
    expect(tileNames()).toEqual(TILES);
    expect(screen.getByRole('button', { name: 'Open returns, 1' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^Collected this month, \$[\d,.]+$/ })).toBeVisible();
    expect(screen.getByText(/follow UTC/)).toBeVisible();
  });

  it('shows a shop awaiting its first payment only what its catalogue permission opens', async () => {
    await openHomeAs('unpaid-seller@example.com');

    expect(await screen.findByRole('button', { name: /^Low on stock, \d+$/ })).toBeVisible();
    expect(tileNames()).toEqual(['Low on stock']);
    // No money tile, so no word on how its days are counted.
    expect(screen.queryByText(/follow UTC/)).toBeNull();
  });

  it('opens the orders needing action from their tile', async () => {
    await openHomeAs('admin@example.com');

    await tap(await screen.findByRole('button', { name: /^Orders needing action/ }));

    expect(await screen.findByRole('header', { name: 'Orders' })).toBeVisible();
    expect(screen.getByRole('tab', { name: /^Needs action/ })).toBeSelected();
    expect(await screen.findByRole('button', { name: /^Order 1042,/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Order 1037,/ })).toBeNull();
  });

  it('opens every order from a collected tile, and the low-stock products from theirs', async () => {
    await openHomeAs('admin@example.com');

    await tap(await screen.findByRole('button', { name: /^Collected today/ }));
    expect(await screen.findByRole('tab', { name: 'All' })).toBeSelected();

    await tap(screen.getByRole('tab', { name: 'Home' }));
    await tap(await screen.findByRole('button', { name: /^Low on stock/ }));
    expect(await screen.findByRole('header', { name: 'Products' })).toBeVisible();
  });

  it('opens its tab without a search typed in Orders before', async () => {
    await openHomeAs('admin@example.com');
    await openTab('Orders');
    await searchOrders('1037');
    expect(screen.getByText(/^No orders match/)).toBeVisible();

    await openTab('Home');
    await tap(screen.getByRole('button', { name: /^Orders needing action/ }));
    expect(await screen.findByRole('button', { name: /^Order 1042,/ })).toBeVisible();
    expect(screen.getByLabelText('Order number or customer')).toHaveDisplayValue('');

    // The same tile again, onto the tab it opened: the search goes again.
    await searchOrders('1037');
    expect(screen.getByText(/^No orders match/)).toBeVisible();
    await openTab('Home');
    await tap(screen.getByRole('button', { name: /^Orders needing action/ }));
    expect(await screen.findByRole('button', { name: /^Order 1042,/ })).toBeVisible();
    expect(screen.getByLabelText('Order number or customer')).toHaveDisplayValue('');
  });

  it('reads the figures again on pull to refresh', async () => {
    await openHomeAs('admin@example.com');
    const count = await needingAction();

    shipElsewhere();
    await pullToRefresh();

    expect(
      await screen.findByRole('button', { name: `Orders needing action, ${count - 1}` })
    ).toBeVisible();
  });

  it('reads the figures again on returning to the tab', async () => {
    await openHomeAs('admin@example.com');
    const count = await needingAction();
    await openTab('Orders');
    await screen.findByRole('header', { name: 'Orders' });

    shipElsewhere();
    await openTab('Home');

    expect(
      await screen.findByRole('button', { name: `Orders needing action, ${count - 1}` })
    ).toBeVisible();
  });
});

/** The figure on the "Orders needing action" tile. */
async function needingAction(): Promise<number> {
  const tile = await screen.findByRole('button', { name: /^Orders needing action/ });
  return Number(String(tile.props.accessibilityLabel).split(', ')[1]);
}

/** A colleague ships #1040 on the website. */
function shipElsewhere(): void {
  changeMockOrder('ord_1040', (order) => {
    for (const part of order.consignments) part.status = 'shipped';
  });
}

/** Searches the orders, and lets the search settle (it waits for typing to rest) and its answer arrive. */
async function searchOrders(text: string): Promise<void> {
  await type('Order number or customer', text);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
  await settle();
}
