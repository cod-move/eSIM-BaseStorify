import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Animated } from 'react-native';
import * as endpoints from '@/api/endpoints/order-creation';
import * as operationEndpoints from '@/api/endpoints/operations';
import { ApiError, NetworkError } from '@/api/errors';
import en from '@/i18n/messages/en.json';
import { allMockOrders } from '@/api/mocks/routes/orders';
import { changeMockProduct } from '@/api/mocks/routes/products';
import { allMockOrderContacts, expireMockManualQuotes } from '@/api/mocks/routes/order-creation';
import './hooks';
import './preload-app';
import { readBarcode } from './camera';
import {
  currentPath,
  openTab,
  press,
  settle,
  signIn,
  tap,
  type,
  wait,
  waitForSearch,
} from './screens';

// Each test signs in and builds a whole order; under a full parallel run that
// takes longer than Jest's default 5 seconds.
jest.setTimeout(20_000);

beforeEach(() => {
  onlineManager.setOnline(true);
  // Model the completed native-driver sheet animation, whose JS opacity
  // otherwise stays at zero in Jest. Assertions still require visible UI.
  const timing = Animated.timing;
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    if (config.duration !== 320 && config.duration !== 200) return timing(value, config);
    return {
      start: (done) => {
        if (value instanceof Animated.Value && typeof config.toValue === 'number')
          value.setValue(config.toValue);
        done?.({ finished: true });
      },
      stop: () => undefined,
      reset: () => undefined,
    };
  });
});
afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});
async function createScreen() {
  await signIn();
  await openTab('Orders');
  await press('Create order');
  await settle();
  expect(currentPath()).toBe('/orders/new');
}
async function choose(label: string, name: string) {
  await press(label);
  await wait(400);
  await tap(screen.getByRole('radio', { name }));
  await wait(400);
}
async function done() {
  const button = screen
    .getAllByRole('button')
    .find((candidate) => String(candidate.props.accessibilityLabel ?? '').startsWith('Done'));
  await tap(button!);
  await wait(400);
}
async function items() {
  await press('Add products');
  await wait(400);
  await tap(await screen.findByRole('button', { name: 'Ceramic bud vase' }));
  await done();
  await type('Quantity for item 1', '2');
}
async function guestPickup() {
  await createScreen();
  await items();
  await tap(screen.getByRole('radio', { name: 'Guest order' }));
  await type('Customer name, required', 'Mobile guest');
  await type('Customer email, required', 'mobile.guest@example.com');
  await choose('Fulfillment', 'Collect at Main warehouse');
  await press('Review order');
  await settle();
  await screen.findByRole('button', { name: 'Create order' });
}
async function confirmOrder() {
  await press('Create order');
  await wait(400);
  await press('Confirm creation');
  await settle();
}

it('creates a guest pickup order with server totals and starts the next order with an empty draft', async () => {
  await guestPickup();
  const submit = jest.spyOn(endpoints, 'createOrder');
  await confirmOrder();
  const created = allMockOrders()[0]!;
  expect(currentPath()).toBe(`/orders/${created.id}`);
  expect(created).toMatchObject({ paymentStatus: 'pending', consignments: [{ pickup: true }] });
  expect(created.lines[0]?.quantity).toBe(2);
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => router.replace('/orders/new'));
  await settle();
  expect(screen.getAllByText('No products added yet').length).toBeGreaterThan(0);
  expect(screen.queryByLabelText('Quantity for item 1')).toBeNull();
});

it('uses an existing customer address and only records cash after an explicit payment confirmation', async () => {
  const savedAddress = allMockOrderContacts()[0]!.addresses[0]!;
  savedAddress.country = 'United States';
  delete savedAddress.name;
  await createScreen();
  await items();
  await tap(await screen.findByRole('button', { name: 'Amina Customer' }));
  expect(screen.getByLabelText('Recipient name, required')).toHaveDisplayValue('Amina Customer');
  expect(screen.getByLabelText('Street address, required')).toHaveDisplayValue('12 Lake Road');
  expect(screen.getByLabelText('City, required')).toHaveDisplayValue('Dhaka');
  expect(screen.getByText('United States')).toBeVisible();
  await tap(screen.getByRole('radio', { name: 'Cash collected' }));
  await press('Review order');
  await settle();
  const submit = jest.spyOn(endpoints, 'createOrder');
  await tap(screen.getByRole('switch', { name: 'Record payment already received' }));
  await confirmOrder();
  expect(currentPath()).toBe(`/orders/${allMockOrders()[0]!.id}`);
  expect(allMockOrders()[0]!.paymentStatus).toBe('paid');
  expect(submit.mock.calls[0]?.[1].recordPayment).toEqual({});
  // With several locations, the store allocates the stock unless one is chosen.
  expect(submit.mock.calls[0]?.[1].draft.locationId).toBeUndefined();
});

it('fills no hidden address for an existing customer when the order is collected', async () => {
  await createScreen();
  await items();
  await choose('Fulfillment', 'Collect at Main warehouse');
  await tap(await screen.findByRole('button', { name: 'Amina Customer' }));
  const quote = jest.spyOn(endpoints, 'quoteOrder');
  await press('Review order');
  await settle();
  expect(quote.mock.calls[0]?.[1]).toMatchObject({
    customer: { kind: 'existing', id: 'account:customer_amina' },
    deliveryId: 'pickup:loc_main',
  });
  expect(quote.mock.calls[0]?.[1].shippingAddress).toBeUndefined();
});

it('frees a creation the store never received, and sends the same one again with its key', async () => {
  await guestPickup();
  const before = allMockOrders().length;
  const original = endpoints.createOrder;
  const keys: string[] = [];
  let reaches = false;
  jest.spyOn(endpoints, 'createOrder').mockImplementation(async (...args) => {
    keys.push(args[2]);
    if (reaches) return original(...args);
    throw new NetworkError('timeout');
  });
  await press('Create order');
  await wait(400);
  await press('Confirm creation');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  // No answer: the store may have made it, so the draft waits for a check.
  expect(screen.getByRole('button', { name: 'Create order' })).toBeDisabled();
  await press('Check original creation');
  await settle();
  // The store has no record of it: nothing was made, and the draft is free.
  expect(screen.getByText(en.orders.create.notCreated)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Check original creation' })).toBeNull();
  expect(allMockOrders()).toHaveLength(before);
  reaches = true;
  await confirmOrder();
  expect(allMockOrders()).toHaveLength(before + 1);
  expect(currentPath()).toBe(`/orders/${allMockOrders()[0]!.id}`);
  expect(keys.length).toBeGreaterThan(1);
  expect(new Set(keys).size).toBe(1);
});

it('keeps the draft free after a refusal no unanswered try preceded, and asks for a new quote', async () => {
  await guestPickup();
  const before = allMockOrders().length;
  jest
    .spyOn(endpoints, 'createOrder')
    .mockRejectedValueOnce(
      new ApiError(403, 'AUTHORIZATION_ERROR', '', { reason: 'CUSTOMER_NOT_ALLOWED' })
    );
  await confirmOrder();
  expect(screen.getByText(en.errors.reason.CUSTOMER_NOT_ALLOWED)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Check original creation' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh quote' })).toBeEnabled();
  await press('Back');
  await press('Back');
  await wait(400);
  await press('Discard draft');
  await wait(400);
  expect(currentPath()).toBe('/orders');
  expect(allMockOrders()).toHaveLength(before);
});

it('asks for a new quote after the store refuses the creation the quote was used for', async () => {
  await guestPickup();
  changeMockProduct('prod_vase', (product) => {
    product.stock.loc_main!.available = 1;
  });
  await confirmOrder();
  expect(screen.getByText(en.errors.reason.INSUFFICIENT_STOCK)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Create order' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh quote' })).toBeEnabled();
});

it('creates from a fresh quote when the phone clock is minutes ahead of the store', async () => {
  const original = endpoints.quoteOrder;
  jest.spyOn(endpoints, 'quoteOrder').mockImplementation(async (...args) => {
    const quote = await original(...args);
    // The store's clock is ten minutes behind the phone's.
    return { ...quote, expiresAt: new Date(Date.parse(quote.expiresAt) - 600_000).toISOString() };
  });
  await guestPickup();
  const before = allMockOrders().length;
  await confirmOrder();
  expect(allMockOrders()).toHaveLength(before + 1);
});

it('lets a quote run out after its lifetime, counted on the phone from when it was asked for', async () => {
  await guestPickup();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(301_000);
  });
  expect(screen.queryByRole('button', { name: 'Create order' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh quote' })).toBeEnabled();
});

it('words a refused stock location for creating an order', async () => {
  await createScreen();
  jest
    .spyOn(endpoints, 'quoteOrder')
    .mockRejectedValueOnce(new ApiError(409, 'CONFLICT', '', { reason: 'LOCATION_NOT_ALLOWED' }));
  await items();
  await tap(screen.getByRole('radio', { name: 'Guest order' }));
  await type('Customer name, required', 'Mobile guest');
  await type('Customer email, required', 'mobile.guest@example.com');
  await choose('Fulfillment', 'Collect at Main warehouse');
  await press('Review order');
  await settle();
  expect(screen.getByText(en.orders.create.reasons.LOCATION_NOT_ALLOWED)).toBeVisible();
});

it('says on its row why a product cannot be ordered', async () => {
  await createScreen();
  await press('Add products');
  await wait(400);
  await type('Search products or SKU', 'Hanging planter');
  await waitForSearch();
  const row = await screen.findByRole('button', { name: 'Hanging planter' });
  expect(row).toBeDisabled();
  expect(screen.getByText(en.errors.reason.PRODUCT_NOT_ORDERABLE)).toBeVisible();
});

it('requires a fresh quote review after a concurrent price change before creating anything', async () => {
  await guestPickup();
  const before = allMockOrders().length;
  const quote = jest.spyOn(endpoints, 'quoteOrder');
  changeMockProduct('prod_vase', (product) => {
    product.price = 27;
  });
  await confirmOrder();
  expect(screen.getByText('Items, prices or options changed. Review a new quote.')).toBeVisible();
  expect(allMockOrders()).toHaveLength(before);
  expect(quote).not.toHaveBeenCalled();
  await press('Refresh quote');
  await settle();
  expect(quote).toHaveBeenCalledTimes(1);
  await confirmOrder();
  expect(allMockOrders()).toHaveLength(before + 1);
  expect(currentPath()).toBe(`/orders/${allMockOrders()[0]!.id}`);
});

it('recovers the original creation using reads when the server response is uncertain', async () => {
  await guestPickup();
  const before = allMockOrders().length;
  const original = endpoints.createOrder;
  const submit = jest.spyOn(endpoints, 'createOrder').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    throw new ApiError(409, 'CONFLICT', '', {
      reason: 'OPERATION_RECONCILIATION_REQUIRED',
      details: { operation: { ...result.operation, state: 'unknown' } },
    });
  });
  await confirmOrder();
  expect(screen.getByRole('button', { name: 'Create order' })).toBeDisabled();
  await press('Check original creation');
  await settle();
  expect(currentPath()).toBe(`/orders/${allMockOrders()[0]!.id}`);
  expect(allMockOrders()).toHaveLength(before + 1);
  expect(submit).toHaveBeenCalledTimes(1);
});

it('unlocks an aborted creation and shows the server refusal without creating another order', async () => {
  await guestPickup();
  const before = allMockOrders().length;
  const submit = jest
    .spyOn(endpoints, 'createOrder')
    .mockImplementationOnce(async (_scope, _body, key) => {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', '', {
        reason: 'OPERATION_OUTCOME_UNKNOWN',
        details: {
          operation: {
            key,
            state: 'unknown',
            routeId: 'orders.creation.create',
            resources: [],
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });
  const recover = jest
    .spyOn(operationEndpoints, 'getOperation')
    .mockImplementation(async (_scope, key) => ({
      key,
      state: 'failed',
      routeId: 'orders.creation.create',
      resources: [],
      updatedAt: new Date().toISOString(),
      reason: 'TRANSACTIONS_UNAVAILABLE',
    }));
  await confirmOrder();
  expect(screen.getByRole('button', { name: 'Create order' })).toBeDisabled();
  await press('Check original creation');
  await settle();
  expect(
    screen.getByText(
      'The store cannot save orders right now. No order was created. Ask an administrator to check the store setup.'
    )
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Check original creation' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Review order' })).toBeEnabled();
  expect(allMockOrders()).toHaveLength(before);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(recover).toHaveBeenCalledTimes(1);
});

it('does not create from an expired quote and renews only after explicit review', async () => {
  await guestPickup();
  const before = allMockOrders().length;
  expireMockManualQuotes();
  await confirmOrder();
  expect(
    screen.getByText('This quote expired. Review a new quote before creating the order.')
  ).toBeVisible();
  expect(allMockOrders()).toHaveLength(before);
  await press('Refresh quote');
  await settle();
  await confirmOrder();
  expect(allMockOrders()).toHaveLength(before + 1);
});

it('keeps quantity edits through review and requires explicit discard on Back', async () => {
  await createScreen();
  await items();
  await tap(screen.getByRole('radio', { name: 'Guest order' }));
  await type('Customer name, required', 'Mobile guest');
  await type('Customer email, required', 'mobile.guest@example.com');
  await choose('Fulfillment', 'Collect at Main warehouse');
  await press('Review order');
  await settle();
  await press('Edit');
  expect(screen.getByLabelText('Quantity for item 1')).toHaveDisplayValue('2');
  await press('One more of item 1');
  expect(screen.getByLabelText('Quantity for item 1')).toHaveDisplayValue('3');
  await press('Back');
  await wait(400);
  expect(screen.getByText('Discard this order draft?')).toBeVisible();
  await press('Keep editing');
  await wait(400);
  expect(screen.getByLabelText('Quantity for item 1')).toHaveDisplayValue('3');
  await press('Back');
  await wait(400);
  await press('Discard draft');
  await wait(400);
  expect(currentPath()).toBe('/orders');
  await press('Create order');
  await settle();
  expect(screen.queryByLabelText('Quantity for item 1')).toBeNull();
});

it('creates a guest contact once and then selects it without creating an account', async () => {
  await createScreen();
  await items();
  await tap(screen.getByRole('radio', { name: 'New guest contact' }));
  await type('Customer name, required', 'New mobile contact');
  await type('Customer email, required', 'new.contact@example.com');
  await press('Create contact');
  await settle();
  expect(screen.getByRole('button', { name: 'Change' })).toBeVisible();
  expect(screen.getAllByText('New mobile contact').length).toBeGreaterThan(0);
  expect(
    allMockOrderContacts().filter((contact) => contact.email === 'new.contact@example.com')
  ).toEqual([expect.objectContaining({ kind: 'guest', name: 'New mobile contact' })]);
});

it('reads a repeated camera code once and lets the operator choose the item and quantity', async () => {
  await createScreen();
  const products = jest.spyOn(endpoints, 'getOrderCreationProducts');
  await press('Scan an item');
  await wait(400);
  await readBarcode('4006381333931', { times: 3 });
  await settle();
  expect(screen.queryByTestId('camera')).toBeNull();
  expect(products.mock.calls.filter((call) => call[1].barcode === '4006381333931')).toHaveLength(1);
  expect(screen.queryByLabelText('Quantity for item 1')).toBeNull();
  await tap(await screen.findByRole('button', { name: 'Ceramic bud vase' }));
  await done();
  expect(screen.getByLabelText('Quantity for item 1')).toHaveDisplayValue('1');
});
