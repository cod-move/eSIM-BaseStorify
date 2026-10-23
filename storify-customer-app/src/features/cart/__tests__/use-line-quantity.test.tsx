import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as endpoints from '@/api/endpoints/cart';
import type { Cart, CartLine } from '@/contracts/mobile/shop/v1';
import { useLineQuantity } from '@/features/cart/use-line-quantity';

let sent: jest.SpiedFunction<typeof endpoints.setCartLine>;

beforeEach(() => {
  // The store never answers: what matters is what was asked.
  sent = jest
    .spyOn(endpoints, 'setCartLine')
    .mockImplementation(() => new Promise<Cart>(() => undefined));
});
afterEach(() => sent.mockRestore());

/** A line of the cart with the quantity the store last said. */
const lineOf = (quantity: number) => ({ productId: 'p-1', variantId: 'v-1', quantity }) as CartLine;

function renderStepper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ line }: { line: CartLine }) => useLineQuantity(line), {
    wrapper,
    initialProps: { line: lineOf(1) },
  });
}

describe('the cart stepper', () => {
  it('sends the newest quantity once, on unmount, when a refetch lands during the pause', async () => {
    const stepper = await renderStepper();

    // Up, then back to what the store had when the taps began.
    await act(async () => stepper.result.current.change(2));
    await act(async () => stepper.result.current.change(1));
    // Meanwhile the cart is refetched: another device made it 3.
    await stepper.rerender({ line: lineOf(3) });
    expect(stepper.result.current.quantity).toBe(1);

    await stepper.unmount();

    await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    expect(sent.mock.calls[0]?.[1]).toEqual({ productId: 'p-1', variantId: 'v-1', quantity: 1 });
  });

  it('sends the newest quantity once when the pause ends, and not again on unmount', async () => {
    const stepper = await renderStepper();

    await act(async () => stepper.result.current.change(2));
    await act(async () => stepper.result.current.change(1));
    await stepper.rerender({ line: lineOf(3) });

    await waitFor(() => expect(sent).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await stepper.unmount();
    await act(async () => {});

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]?.[1]).toMatchObject({ quantity: 1 });
  });

  it('sends nothing when the newest count is what the store already has', async () => {
    const stepper = await renderStepper();

    await act(async () => stepper.result.current.change(3));
    await stepper.rerender({ line: lineOf(3) });
    await stepper.unmount();
    await act(async () => {});

    expect(sent).not.toHaveBeenCalled();
  });
});
