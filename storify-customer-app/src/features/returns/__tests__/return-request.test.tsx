import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import * as endpoints from '@/api/endpoints/returns';
import { ApiError } from '@/api/errors';
import { ReturnRequest } from '@/features/returns/request-return';
import { getMessages } from '@/i18n/messages';

import { line, money, order } from './order';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack, canGoBack: () => true }),
}));
jest.mock('@/features/chat/use-conversations', () => ({ useChatAvailable: () => true }));
jest.mock('@/features/config/use-config', () => ({ useConfig: () => ({ data: undefined }) }));

const INSETS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        <SafeAreaProvider initialMetrics={INSETS}>{children}</SafeAreaProvider>
      </IntlProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
});

const CASH_OPTIONS = {
  reasons: [
    { code: 'changed_mind', label: 'Changed my mind', noteRequired: false },
    { code: 'damaged_or_defective', label: 'Damaged or defective', noteRequired: false },
  ],
  refundDestination: {
    required: true,
    message: 'You paid on delivery, so there is no card to refund.',
    methods: [
      {
        method: 'cash',
        label: 'Cash in person',
        fields: [],
        note: 'The store will arrange handing the refund to you in person.',
      },
    ],
  },
};

function refund(total: number, shipping = money(0, '৳0.00')) {
  return {
    items: money(100, '৳100.00'),
    discount: money(0, '৳0.00'),
    tax: money(5, '৳5.00'),
    shipping,
    restockingFee: money(0, '৳0.00'),
    returnShippingFee: money(0, '৳0.00'),
    total: money(total, `৳${total}.00`),
  };
}
afterEach(() => jest.restoreAllMocks());

describe('a store that takes returns through its team', () => {
  it('shows "Contact the store" instead of the flow, from the order', async () => {
    const options = jest.spyOn(endpoints, 'getReturnOptions');
    const placed = order([line(0, 1, 0)], {
      canReturn: false,
      returnBlockedReason: 'RETURNS_THROUGH_STORE',
      returnBlockedMessage: 'This seller takes returns through our team.',
    });

    await render(<ReturnRequest order={placed} />, { wrapper: Wrapper });

    expect(screen.getByText('Contact the store')).toBeTruthy();
    expect(screen.getByText('This seller takes returns through our team.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Message the store' })).toBeTruthy();
    expect(screen.queryByText('Submit request')).toBeNull();
    expect(options).not.toHaveBeenCalled();
  });

  it('shows "Contact the store" when the store refuses with RETURNS_THROUGH_STORE', async () => {
    jest.spyOn(endpoints, 'getReturnOptions').mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Returns go through our team.', {
        reason: 'RETURNS_THROUGH_STORE',
      })
    );

    await render(<ReturnRequest order={order([line(0, 1, 1)])} />, { wrapper: Wrapper });

    expect(await screen.findByText('Contact the store')).toBeTruthy();
    expect(screen.getByText('Returns go through our team.')).toBeTruthy();
  });
});

describe('the items of a return', () => {
  it("opens an item's product from its picture, apart from the choice to return it", async () => {
    jest.spyOn(endpoints, 'getReturnOptions').mockResolvedValue({
      reasons: [{ code: 'changed_mind', label: 'Changed my mind', noteRequired: false }],
      refundDestination: { required: false, methods: [] },
    });
    const shirt = { ...line(0, 2, 2), name: 'Linen shirt', slug: 'linen-shirt' };

    await render(<ReturnRequest order={order([shirt])} />, { wrapper: Wrapper });
    await fireEvent.press(await screen.findByRole('link', { name: 'Linen shirt' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[slug]',
      params: { slug: 'linen-shirt' },
    });
    // The row beside the picture is still the choice to return it, not a way out of the form.
    expect(screen.getByRole('checkbox', { name: /Linen shirt/ })).toBeTruthy();
  });

  it('lists every line: how many of it can come back, or that it was a final sale', async () => {
    jest.spyOn(endpoints, 'getReturnOptions').mockResolvedValue(CASH_OPTIONS);
    const finalSale = {
      ...line(1, 1, 0),
      finalSale: true,
      returnBlockedReason: 'FINAL_SALE',
    };

    await render(<ReturnRequest order={order([line(0, 2, 1), finalSale])} />, {
      wrapper: Wrapper,
    });

    expect(await screen.findByText('Returnable quantity: 1 of 2')).toBeTruthy();
    expect(screen.getByText('Final sale — can’t be returned')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Item 0/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /Item 1/ })).toBeDisabled();
  });
});

describe('what the shopper gets back', () => {
  it('asks for a reason and an item before submitting, then shows the store’s estimate', async () => {
    jest.spyOn(endpoints, 'getReturnOptions').mockResolvedValue(CASH_OPTIONS);
    const preview = jest.spyOn(endpoints, 'previewReturn').mockResolvedValue({
      parcels: [{ lines: [{ index: 0, name: 'Item 0', quantity: 1 }], refund: refund(105) }],
      total: money(105, '৳105.00'),
      storeAtFault: false,
      refundsShipping: false,
      refundDestinationRequired: true,
    });

    await render(<ReturnRequest order={order([line(0, 1, 1)])} />, { wrapper: Wrapper });
    const submit = await screen.findByRole('button', { name: 'Submit request' });
    expect(submit).toBeDisabled();
    expect(screen.getByPlaceholderText('Add details for the store team')).toBeTruthy();
    // The store's own words for a cash order: where the refund goes, and how.
    expect(screen.getByText('You paid on delivery, so there is no card to refund.')).toBeTruthy();
    expect(
      screen.getByText('The store will arrange handing the refund to you in person.')
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('checkbox', { name: /Item 0/ }));
    expect(preview).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Changed my mind' }));

    expect(await screen.findByText('Estimated refund')).toBeTruthy();
    expect(screen.getByText('৳105.00')).toBeTruthy();
    expect(screen.getByText('Not refunded')).toBeTruthy();
    expect(
      screen.getByText(
        'An estimate. The store confirms the final amount after checking the returned items.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/This return is on us/)).toBeNull();

    // Ready once the store's refund destination is chosen.
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: /Cash in person/ }));
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled();
  });

  it('says the return is on the store, and shows the delivery it hands back', async () => {
    jest.spyOn(endpoints, 'getReturnOptions').mockResolvedValue(CASH_OPTIONS);
    jest.spyOn(endpoints, 'previewReturn').mockResolvedValue({
      parcels: [
        {
          lines: [{ index: 0, name: 'Item 0', quantity: 1 }],
          refund: refund(165, money(60, '৳60.00')),
        },
      ],
      total: money(165, '৳165.00'),
      storeAtFault: true,
      refundsShipping: true,
      refundDestinationRequired: true,
    });

    await render(<ReturnRequest order={order([line(0, 1, 1)])} />, { wrapper: Wrapper });
    await fireEvent.press(await screen.findByRole('checkbox', { name: /Item 0/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Damaged or defective' }));

    expect(
      await screen.findByText(
        'This return is on us, so there is no restocking or return shipping fee.'
      )
    ).toBeTruthy();
    expect(screen.getByText('৳60.00')).toBeTruthy();
    expect(screen.queryByText('Not refunded')).toBeNull();
  });

  it('Cancel leaves the form', async () => {
    jest.spyOn(endpoints, 'getReturnOptions').mockResolvedValue(CASH_OPTIONS);

    await render(<ReturnRequest order={order([line(0, 1, 1)])} />, { wrapper: Wrapper });
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
