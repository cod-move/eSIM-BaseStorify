import { act, fireEvent, screen } from '@testing-library/react-native';
import { focusManager } from '@tanstack/react-query';
import { addNotificationReceivedListener, type Notification } from 'expo-notifications';

import { changeMockOrder } from '@/api/mocks/routes/orders';
import { queryClient } from '@/api/query-client';
import type { OrderList } from '@/contracts/mobile/biz/v1';
import type { CachedPages } from '@/api/etag-query';

import './hooks';
import './preload-app';
import {
  openApp,
  openTab,
  pullToRefresh,
  settle,
  signInOnScreen,
  tap,
  type,
  waitForSearch,
} from './screens';

/** The order numbers the list shows, in order. */
function shownNumbers(): string[] {
  return screen
    .queryAllByRole('button')
    .map((row) => /^Order (\d+),/.exec(String(row.props.accessibilityLabel ?? ''))?.[1])
    .filter((number): number is string => Boolean(number));
}

async function openOrdersAs(email: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await openTab('Orders');
  await screen.findByRole('header', { name: 'Orders' });
  await settle();
}

async function chooseTab(name: string | RegExp): Promise<void> {
  await tap(screen.getByRole('tab', { name }));
  await settle();
}

/** #1040 shipped by a colleague on the website: it leaves "Needs action". */
function shipElsewhere(): void {
  changeMockOrder('ord_1040', (order) => {
    for (const part of order.consignments) part.status = 'shipped';
  });
}

/**
 * Orders: the tabs, the search by number or customer, a page at a
 * time, and read again on pull to refresh, on a push about an order and on
 * returning to the app.
 */
describe('the order list', () => {
  it('opens on the orders that need action, and filters by every tab', async () => {
    await openOrdersAs('admin@example.com');

    expect(screen.getByRole('tab', { name: /^Needs action, \d+$/ })).toBeSelected();
    expect(shownNumbers().slice(0, 3)).toEqual(['1042', '1041', '1040']);

    await chooseTab('Shipped');
    expect(shownNumbers()).toEqual(['1037', '1030']);
    await chooseTab('Pre-orders');
    expect(shownNumbers()).toEqual(['1039']);
    await chooseTab('Cancelled');
    expect(shownNumbers()).toEqual(['1035']);
    await chooseTab('Delivered');
    expect(shownNumbers().slice(0, 2)).toEqual(['1036', '1034']);
    await chooseTab('All');
    expect(shownNumbers().slice(0, 2)).toEqual(['1042', '1041']);
  });

  it('describes each row: customer or walk-in sale, items, status, and the payment when it needs a look', async () => {
    await openOrdersAs('admin@example.com');
    await chooseTab('Delivered');

    expect(
      screen.getByRole('button', { name: /^Order 1034, Walk-in sale, \$28\.00, Delivered$/ })
    ).toBeVisible();
    await chooseTab('Pre-orders');
    expect(
      screen.getByRole('button', {
        name: 'Order 1039, Shirin Akter, $20.00, Pre-order, Partly paid',
      })
    ).toBeVisible();
  });

  it("shows a seller their own part of each order, and none of another seller's", async () => {
    await openOrdersAs('seller@example.com');
    await chooseTab('All');

    expect(
      screen.getByRole('button', { name: /^Order 1042, Karim Uddin, \$21\.00,/ })
    ).toBeVisible();
    expect(shownNumbers()).not.toContain('1029');
  });

  it('searches by order number and by customer, and says when nothing matches', async () => {
    await openOrdersAs('admin@example.com');
    await chooseTab('All');

    await type('Order number or customer', 'rina');
    await waitForSearch();
    expect(shownNumbers()).toEqual(['1041']);

    await type('Order number or customer', '1037');
    await waitForSearch();
    expect(shownNumbers()).toEqual(['1037']);

    await type('Order number or customer', 'nobody');
    await waitForSearch();
    expect(screen.getByText('No orders match “nobody”')).toBeVisible();

    await tap(screen.getByRole('button', { name: 'Clear search' }));
    await waitForSearch();
    expect(shownNumbers()[0]).toBe('1042');
  });

  it('reads the next page as the list nears its end', async () => {
    await openOrdersAs('admin@example.com');
    await chooseTab('Delivered');
    const pages = () =>
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['private', 'workspace', 'platform', 'orders', 'list'] })
        .map((query) => query.state.data as CachedPages<OrderList> | undefined)
        // The list prefix also holds Home's bounded single-page preview.
        .find((data) => data?.pages?.[0]?.data.items[0]?.number === '1036');
    expect(pages()?.pages).toHaveLength(1);
    expect(pages()?.pages[0]?.data.nextCursor).not.toBeNull();

    // Scrolled to the end of the first page.
    const scroller = findScroller(screen.root as unknown as Host);
    await fireEvent.scroll(scroller as never, {
      nativeEvent: {
        contentOffset: { x: 0, y: 6000 },
        contentSize: { width: 400, height: 6300 },
        layoutMeasurement: { width: 400, height: 900 },
      },
    });
    await settle();

    expect(pages()?.pages).toHaveLength(2);
    expect(pages()?.pages[1]?.data.items.map((order) => order.number)).toEqual([
      '1011',
      '1010',
      '1009',
    ]);
  });

  it('reads the list again on pull to refresh', async () => {
    await openOrdersAs('admin@example.com');
    expect(shownNumbers()).toContain('1040');

    shipElsewhere();
    await pullToRefresh();

    expect(shownNumbers()).not.toContain('1040');
  });

  it('reads the list again on returning to its tab', async () => {
    await openOrdersAs('admin@example.com');
    expect(shownNumbers()).toContain('1040');

    await openTab('Home');
    shipElsewhere();
    await openTab('Orders');

    expect(shownNumbers()).not.toContain('1040');
  });

  it('reads the list again when a push about an order arrives', async () => {
    await openOrdersAs('admin@example.com');
    expect(shownNumbers()).toContain('1040');

    shipElsewhere();
    await arrives({ url: '/en/admin/orders/ord_1040', type: 'order_status' });

    expect(shownNumbers()).not.toContain('1040');
  });

  it("leaves the list alone for a push about the operator's other workspace", async () => {
    await openOrdersAs('admin@example.com');

    shipElsewhere();
    await arrives({ url: '/en/vendor/orders/ord_1040', type: 'order_status' });

    expect(shownNumbers()).toContain('1040');
  });

  it('reads the list again when the app returns to the foreground', async () => {
    await openOrdersAs('admin@example.com');
    expect(shownNumbers()).toContain('1040');

    shipElsewhere();
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await settle();

    expect(shownNumbers()).not.toContain('1040');
  });
});

type Host = { props: Record<string, unknown>; children: (Host | string)[] };

/** The list's scroll view: the element that listens for scrolling. */
function findScroller(node: Host): Host {
  const found: Host[] = [];
  const visit = (current: Host | string) => {
    if (typeof current === 'string') return;
    if (typeof current.props.onScroll === 'function') found.push(current);
    current.children.forEach(visit);
  };
  visit(node);
  const last = found[found.length - 1];
  if (!last) throw new Error('No list on screen');
  return last;
}

/** A push arriving while the app is open, as expo-notifications hands it to its listeners. */
async function arrives(data: Record<string, string>): Promise<void> {
  const notification = { request: { content: { data } } } as unknown as Notification;
  await act(async () => {
    for (const [listener] of jest.mocked(addNotificationReceivedListener).mock.calls) {
      listener(notification);
    }
  });
  await settle();
}
