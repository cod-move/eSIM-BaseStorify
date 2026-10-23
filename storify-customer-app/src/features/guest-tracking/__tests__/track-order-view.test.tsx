import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { ApiError } from '@/api/errors';
import * as endpoints from '@/api/endpoints/guest-tracking';
import { findGuestOrder } from '@/api/mocks/fixtures/guest-tracking';
import { getMessages } from '@/i18n/messages';

import { TrackOrderView } from '../track-order-view';

jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => jest.fn() }));

const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      <IntlProvider locale="en" timeZone="UTC" messages={getMessages('en')}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
}

async function lookUp(orderNumber: string, contact: string) {
  await render(<TrackOrderView />, { wrapper: Providers });
  await fireEvent.changeText(screen.getByLabelText(/Order number/), orderNumber);
  await fireEvent.changeText(screen.getByLabelText(/Email or phone number/), contact);
  await fireEvent.press(screen.getByRole('button', { name: 'Track order' }));
}

afterEach(() => jest.restoreAllMocks());

describe('tracking an order as a guest', () => {
  it('shows the tracking steps for the number and the email', async () => {
    const order = findGuestOrder('ORD-1005', 'en');
    if (!order) throw new Error('the mock history has no order 1005');
    const spy = jest.spyOn(endpoints, 'trackOrder').mockResolvedValue(order);

    await lookUp('ORD-1005', 'guest@example.com');

    expect(await screen.findByText('Order Placed')).toBeTruthy();
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.getByText('Delivered')).toBeTruthy();
    expect(screen.getByText(order.totals.total.formatted)).toBeTruthy();
    expect(spy).toHaveBeenCalledWith('en', {
      orderNumber: 'ORD-1005',
      contact: 'guest@example.com',
    });
  });

  it('does not ask the store for a contact that cannot be one', async () => {
    const spy = jest.spyOn(endpoints, 'trackOrder');

    await lookUp('ORD-1005', '12345');

    expect(screen.getByText(/at least 7 digits/)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('says so when the store finds no such order, and keeps what was typed', async () => {
    jest
      .spyOn(endpoints, 'trackOrder')
      .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Order not found'));

    await lookUp('ORD-9999', 'guest@example.com');

    expect(await screen.findByText("We couldn't find that order")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByDisplayValue('ORD-9999')).toBeTruthy();
  });

  it('shows the wait the store asks for', async () => {
    jest
      .spyOn(endpoints, 'trackOrder')
      .mockRejectedValue(new ApiError(429, 'RATE_LIMIT_EXCEEDED', '', { retryAfterSeconds: 600 }));

    await lookUp('ORD-1005', 'guest@example.com');

    expect(await screen.findByText(/Wait 10 minutes/)).toBeTruthy();
  });

  it("shows the store's own message for a refusal the app has no sentence for", async () => {
    jest
      .spyOn(endpoints, 'trackOrder')
      .mockRejectedValue(new ApiError(418, 'TEAPOT', 'The shop is a teapot'));

    await lookUp('ORD-1005', 'guest@example.com');

    await waitFor(() => expect(screen.getByText('The shop is a teapot')).toBeTruthy());
  });
});
