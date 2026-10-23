import { act, screen, within } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { useLastNotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';

import { raceNextOrderAction, refuseNextOrderAction } from '@/api/mocks/routes/orders';
import { loseNextAnswer } from '@/api/mocks/server';
import type { OrderActionReason } from '@/contracts/mobile/biz/v1';
import en from '@/i18n/messages/en.json';

import './hooks';
import './preload-app';
import {
  currentPath,
  openApp,
  press,
  pullToRefresh,
  settle,
  signInOnScreen,
  tap,
  type,
} from './screens';

/**
 * A read the test slows down (`holdNextRead`): the store answers it at once,
 * as the order then is, and the answer waits on its way back until
 * `releaseHeldRead()`.
 */
const mockHeld: { path: RegExp | null; release: (() => void) | null } = {
  path: null,
  release: null,
};
/** The next `steps` on an order never reach the store: its front answers 503. */
const mockFaults = { steps: 0 };
afterEach(() => {
  mockFaults.steps = 0;
});

jest.mock('@/api/transport', () => {
  const { mockFetch } =
    jest.requireActual<typeof import('@/api/mocks/server')>('@/api/mocks/server');
  return {
    transport: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (init?.method === 'POST' && /\/actions$/.test(url) && mockFaults.steps > 0) {
        mockFaults.steps -= 1;
        return new Response(JSON.stringify({ success: false, code: 'SERVICE_UNAVAILABLE' }), {
          status: 503,
        });
      }
      const response = await mockFetch(input, init);
      if ((init?.method ?? 'GET') === 'GET' && mockHeld.path?.test(url)) {
        mockHeld.path = null;
        await new Promise<void>((resolve) => {
          mockHeld.release = resolve;
        });
      }
      return response;
    },
  };
});

function holdNextRead(path: RegExp): void {
  mockHeld.path = path;
  mockHeld.release = null;
}

async function releaseHeldRead(): Promise<void> {
  await act(async () => mockHeld.release?.());
  await settle();
}

async function openOrderAs(email: string, id: string): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
  await act(async () => router.push({ pathname: '/orders/[id]', params: { id } }));
  await settle();
}

/** A tap whose three tries each reach the store, and never hear back. */
async function noAnswerTo(step: () => Promise<void>): Promise<void> {
  loseNextAnswer();
  await step();
  for (const wait of [1000, 2000]) {
    loseNextAnswer();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(wait);
    });
  }
  await settle();
}

/** The timeline's events whose words match. */
const events = (words: RegExp) =>
  screen.queryAllByLabelText(words).filter((element) => element.props.accessible);

/**
 * One order: what it holds, the steps the store offers, each tap
 * one `Idempotency-Key`, and every refusal said in the operator's words.
 */
describe('an order', () => {
  it("shows the store's operators every shipment, line, total, the payment, delivery, note and timeline", async () => {
    await openOrderAs('admin@example.com', 'ord_1042');

    expect(await screen.findByRole('header', { name: 'Order #1042' })).toBeVisible();
    expect(screen.getByRole('header', { name: 'Green Leaf Goods, Pending' })).toBeVisible();
    expect(screen.getByRole('header', { name: 'Urban Thread Co., Pending' })).toBeVisible();
    expect(screen.getByText('Linen tea towel (set of 2)')).toBeVisible();
    expect(screen.getByText('Organic cotton tee')).toBeVisible();
    expect(screen.getByText('M · SKU TEE-ORG-M')).toBeVisible();
    expect(screen.getByLabelText('Subtotal, $68.00')).toBeVisible();
    // In the summary and in the payment's figures.
    expect(screen.getAllByLabelText('Total, $74.00')).toHaveLength(2);
    expect(screen.getByLabelText('Method, Cash on delivery')).toBeVisible();
    expect(screen.getByLabelText('Delivery option, Standard delivery')).toBeVisible();
    expect(
      screen.getByLabelText(/^Ship to, Karim Uddin, House 12, Road 5, Dhaka 1207/)
    ).toBeVisible();
    expect(screen.getByText('Please call before delivery.')).toBeVisible();
    expect(events(/^Order placed,/)).toHaveLength(1);
    // The next step in the bar; cancelling at the page's end; one seller's part on its own.
    expect(screen.getByRole('button', { name: 'Mark as processing' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Cancel this part' })).toHaveLength(2);
  });

  it('shows a seller only their own shipment, and no cancel of another part', async () => {
    await openOrderAs('seller@example.com', 'ord_1042');

    expect(await screen.findByText('Linen tea towel (set of 2)')).toBeVisible();
    expect(screen.queryByText('Organic cotton tee')).toBeNull();
    expect(screen.queryByText(/Urban Thread/)).toBeNull();
    expect(screen.queryByLabelText(/^Bill to,/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel this part' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeVisible();
  });

  it("offers a store's staff without cancel permission the step, and no cancel", async () => {
    await openOrderAs('staff@example.com', 'ord_1040');

    expect(await screen.findByRole('button', { name: 'Mark as processing' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it('takes the next step, and shows the order the store answered with', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');

    await press('Mark as processing');
    await settle();

    expect(screen.getByText('Order #1040 is processing')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Mark as shipped' })).toBeVisible();
    expect(events(/^Status changed from pending to processing, /)).toHaveLength(1);
  });

  it('keeps the answer to a step when a read of the order that went out before it lands after it', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');

    // A pull to refresh goes out; its answer, the order before the step, is slow.
    holdNextRead(/\/orders\/ord_1040$/);
    await pullToRefresh();
    await press('Mark as processing');
    await settle();
    expect(screen.getByText('Order #1040 is processing')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mark as shipped' })).toBeVisible();

    await releaseHeldRead();

    expect(screen.getByRole('button', { name: 'Mark as shipped' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark as processing' })).toBeNull();
  });

  it('sends a step again with the same key when its answer is lost, so it is made once', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');

    // The store makes the step; its answer never arrives. The app asks again
    // with the tap's key and gets the first answer back: with a new key the
    // store would refuse a step the order has already taken.
    loseNextAnswer();
    await press('Mark as processing');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    await settle();

    expect(screen.getByText('Order #1040 is processing')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Mark as shipped' })).toBeVisible();
    expect(events(/^Status changed from pending to processing, /)).toHaveLength(1);
  });

  it('says so when no answer ever came, and shows the order as the store has it', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');

    // Each of the tap's three tries reaches the store; no answer comes back.
    loseNextAnswer();
    await press('Mark as processing');
    for (const wait of [1000, 2000]) {
      loseNextAnswer();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(wait);
      });
    }
    await settle();

    expect(
      screen.getByText("The store didn't answer. Tap again: it won't be done twice.")
    ).toBeVisible();
    // Read again: the first try was made, and only once.
    expect(await screen.findByRole('button', { name: 'Mark as shipped' })).toBeVisible();
    expect(events(/^Status changed from pending to processing, /)).toHaveLength(1);
  });

  it('asks for the carrier and the tracking number to mark an order shipped', async () => {
    await openOrderAs('admin@example.com', 'ord_1041');

    await press('Mark as shipped');
    // The sheet, still rising.
    expect(await screen.findByRole('header', { name: 'Mark as shipped' })).toBeOnTheScreen();
    await press('Mark as shipped');
    expect(screen.getByText('Enter the carrier.')).toBeOnTheScreen();
    expect(screen.getByText('Enter the tracking number.')).toBeOnTheScreen();

    await type('Carrier, required', 'Pathao');
    await type('Tracking number, required', 'PTH-1');
    await press('Mark as shipped');
    await settle();

    expect(screen.getByText('Order #1041 is marked as shipped')).toBeVisible();
    expect(screen.getAllByLabelText('Carrier, Pathao').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PTH-1').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Mark as delivered' })).toBeVisible();
  });

  it('keeps the shipping sheet open on a field the store still finds missing', async () => {
    await openOrderAs('admin@example.com', 'ord_1041');
    refuseNextOrderAction('ord_1041', {
      status: 400,
      code: 'VALIDATION_ERROR',
      reason: 'TRACKING_REQUIRED',
      errors: { trackingNumber: ['Required'] },
    });

    await press('Mark as shipped');
    await type('Carrier, required', 'Pathao');
    await type('Tracking number, required', 'PTH-1');
    await press('Mark as shipped');
    await settle();

    expect(screen.getByText('Enter the tracking number.')).toBeOnTheScreen();
    expect(screen.queryByText('Enter the carrier.')).toBeNull();
    expect(screen.getByRole('header', { name: 'Mark as shipped' })).toBeOnTheScreen();
  });

  it('keeps the shipping sheet and what was typed when offline, to send once back online', async () => {
    await openOrderAs('admin@example.com', 'ord_1041');
    await press('Mark as shipped');
    await type('Carrier, required', 'Pathao');
    await type('Tracking number, required', 'PTH-1');

    await act(async () => onlineManager.setOnline(false));
    try {
      await press('Mark as shipped');
      await settle();

      expect(screen.getByText("You're offline. Nothing was sent.")).toBeVisible();
      expect(screen.getByRole('header', { name: 'Mark as shipped' })).toBeOnTheScreen();
      // Nothing went out: the fields are still the operator's.
      expect(screen.getByLabelText('Carrier, required')).toHaveDisplayValue('Pathao');
      expect(screen.getByLabelText('Tracking number, required')).toBeEnabled();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }

    await press('Mark as shipped');
    await settle();
    expect(screen.getByText('Order #1041 is marked as shipped')).toBeVisible();
  });

  it('keeps the shipping sheet when no answer came, locked, and sends the same step again', async () => {
    await openOrderAs('admin@example.com', 'ord_1041');
    await press('Mark as shipped');
    await type('Carrier, required', 'Pathao');
    await type('Tracking number, required', 'PTH-1');

    // The step is made; none of the tap's three tries hears back.
    await noAnswerTo(() => press('Mark as shipped'));

    expect(screen.getByRole('header', { name: 'Mark as shipped' })).toBeOnTheScreen();
    expect(screen.getAllByText(en.orders.steps.noAnswer).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Carrier, required')).toHaveDisplayValue('Pathao');
    expect(screen.getByLabelText('Carrier, required')).toBeDisabled();
    expect(screen.getByLabelText('Tracking number, required')).toBeDisabled();

    // The same request with the tap's key: the store answers what it did. A new
    // key would be refused, the order being shipped already.
    await press('Try again');
    await settle();
    expect(screen.getByText('Order #1041 is marked as shipped')).toBeVisible();
    expect(screen.queryByRole('header', { name: 'Mark as shipped' })).toBeNull();
    expect(events(/^Status changed from processing to shipped, /)).toHaveLength(1);
  });

  it("keeps the cancel sheet's words when offline, and locks them when no answer came", async () => {
    await openOrderAs('admin@example.com', 'ord_1040');
    await press('Cancel order');
    await tap(await screen.findByRole('radio', { name: 'Another reason' }));
    await type('Reason', 'Customer moved away');

    await act(async () => onlineManager.setOnline(false));
    try {
      await press('Cancel order');
      await settle();

      expect(screen.getByText("You're offline. Nothing was sent.")).toBeVisible();
      expect(screen.getByRole('header', { name: 'Cancel order #1040?' })).toBeOnTheScreen();
      expect(screen.getByLabelText('Reason')).toHaveDisplayValue('Customer moved away');
      expect(screen.getByLabelText('Reason')).toBeEnabled();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }

    await noAnswerTo(() => press('Cancel order'));

    expect(screen.getByRole('header', { name: 'Cancel order #1040?' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Reason')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Out of stock' })).toBeDisabled();
    await press('Try again');
    await settle();
    expect(screen.getByText('Order #1040 is cancelled')).toBeVisible();
    expect(screen.getByText('Customer moved away')).toBeVisible();
  });

  it('keeps the cancel sheet, locked, when the store fails every try, and sends the same step again', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');
    await press('Cancel order');
    await tap(await screen.findByRole('radio', { name: 'Another reason' }));
    expect(screen.getByLabelText('Reason').props.maxLength).toBe(500);
    await type('Reason', 'Customer moved away');

    // Three tries, a second apart (the store's default wait), each a 503.
    mockFaults.steps = 3;
    await press('Cancel order');
    for (let tries = 1; tries < 3; tries += 1) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
    }
    await settle();

    expect(mockFaults.steps).toBe(0);
    expect(screen.getByRole('header', { name: 'Cancel order #1040?' })).toBeOnTheScreen();
    expect(screen.getAllByText(en.orders.steps.noAnswer).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Reason')).toHaveDisplayValue('Customer moved away');
    expect(screen.getByLabelText('Reason')).toBeDisabled();
    await press('Try again');
    await settle();
    expect(screen.getByText('Order #1040 is cancelled')).toBeVisible();
    expect(screen.getByText('Customer moved away')).toBeVisible();
  });

  it('cancels after a confirmation and a reason, and keeps the reason on the order', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');

    await press('Cancel order');
    expect(await screen.findByRole('header', { name: 'Cancel order #1040?' })).toBeOnTheScreen();
    // The sheet's own button waits for a reason.
    expect(screen.getAllByRole('button', { name: 'Cancel order' }).at(-1)).toBeDisabled();
    await tap(screen.getByRole('radio', { name: 'Out of stock' }));
    await press('Cancel order');
    await settle();

    expect(screen.getByText('Order #1040 is cancelled')).toBeVisible();
    expect(screen.getByText('Out of stock')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark as processing' })).toBeNull();
  });

  it("calls off one seller's part of a split order", async () => {
    await openOrderAs('admin@example.com', 'ord_1042');

    const urban = await screen.findByRole('header', { name: 'Urban Thread Co., Pending' });
    expect(urban).toBeVisible();
    await tap(screen.getAllByRole('button', { name: 'Cancel this part' })[1]!);
    expect(
      await screen.findByRole('header', { name: "Cancel Urban Thread Co.'s part of order #1042?" })
    ).toBeOnTheScreen();
    await tap(screen.getByRole('radio', { name: 'Another reason' }));
    await type('Reason', 'Seller is closed this week');
    await press('Cancel this part');
    await settle();

    expect(screen.getByText("Urban Thread Co.'s part of order #1042 is cancelled")).toBeVisible();
    expect(
      await screen.findByRole('header', { name: 'Urban Thread Co., Cancelled' })
    ).toBeVisible();
    expect(screen.getByRole('header', { name: 'Green Leaf Goods, Pending' })).toBeVisible();
  });

  it('shows the order as somebody else left it, and says so, when the step lost a race', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');
    raceNextOrderAction('ord_1040', (order) => {
      for (const part of order.consignments) part.status = 'processing';
    });

    await press('Mark as processing');
    await settle();

    expect(
      screen.getByText('Someone else changed this order. Check it and try again.')
    ).toBeVisible();
    expect(screen.getByText(en.errors.reason.ORDER_STATE_CHANGED)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mark as shipped' })).toBeVisible();
  });

  it('offers a native refund when cancellation needs one and the operator may issue it', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');
    refuseNextOrderAction('ord_1040', {
      status: 409,
      code: 'CONFLICT',
      reason: 'CANCEL_NEEDS_REFUND',
    });

    await press('Cancel order');
    await tap(await screen.findByRole('radio', { name: 'The customer asked to cancel' }));
    await press('Cancel order');
    await settle();

    expect(screen.getByText(en.errors.reason.CANCEL_NEEDS_REFUND)).toBeVisible();
    await press('Review refund');
    await settle();
    expect(currentPath()).toBe('/refunds/new');
    expect(screen.queryByTestId('web-page')).toBeNull();
  });

  const REFUSALS: [OrderActionReason, number, string][] = [
    ['TRANSITION_NOT_ALLOWED', 409, 'CONFLICT'],
    ['PAYMENT_IN_FLIGHT', 409, 'CONFLICT'],
    ['PAYMENT_NOT_RECEIVED', 409, 'CONFLICT'],
    ['PAYMENT_REFUNDED', 409, 'CONFLICT'],
    ['PREORDER_BALANCE_DUE', 409, 'CONFLICT'],
    ['PREORDER_NOT_READY', 409, 'CONFLICT'],
    ['ADDRESS_ON_HOLD', 409, 'CONFLICT'],
    ['PICKUP_CONSIGNMENT', 409, 'CONFLICT'],
    ['OTHER_SELLERS_ITEMS', 403, 'AUTHORIZATION_ERROR'],
  ];

  it.each(REFUSALS)('says %s in its own words, and moves nothing', async (reason, status, code) => {
    await openOrderAs('admin@example.com', 'ord_1040');
    refuseNextOrderAction('ord_1040', { status, code, reason });

    await press('Mark as processing');
    await settle();

    expect(screen.getByText(en.errors.reason[reason])).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mark as processing' })).toBeVisible();
    expect(events(/^Status changed/)).toHaveLength(0);
  });

  it('sends nothing while offline, and says so', async () => {
    await openOrderAs('admin@example.com', 'ord_1040');
    await act(async () => onlineManager.setOnline(false));

    try {
      expect(screen.getByText("You're offline. Changes can't be sent.")).toBeVisible();
      await press('Mark as processing');
      await settle();

      expect(screen.getByText("You're offline. Nothing was sent.")).toBeVisible();
      expect(events(/^Status changed/)).toHaveLength(0);
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
  });

  it('says why shipping waits on an address hold, and offers no shipping', async () => {
    await openOrderAs('admin@example.com', 'ord_1038');

    expect(await screen.findByText('Shipping is on hold')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark as shipped' })).toBeNull();
  });

  it('opens from a tapped push about it', async () => {
    jest.mocked(useLastNotificationResponse).mockReturnValue({
      notification: {
        request: {
          identifier: 'push-order',
          content: { data: { url: '/en/admin/orders/ord_1042', type: 'order_placed' } },
        },
      },
    } as unknown as ReturnType<typeof useLastNotificationResponse>);
    await openApp();
    await signInOnScreen('admin@example.com');

    expect(await screen.findByRole('header', { name: 'Order #1042' })).toBeVisible();
    const customer = screen.getByLabelText('Name, Karim Uddin');
    expect(within(customer).getByText('Karim Uddin')).toBeVisible();
  });
});
