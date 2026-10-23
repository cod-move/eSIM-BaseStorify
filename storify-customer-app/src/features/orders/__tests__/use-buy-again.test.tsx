import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as endpoints from '@/api/endpoints/cart';
import { ApiError } from '@/api/errors';
import type { Cart, OrderLine } from '@/contracts/mobile/shop/v1';
import { useBuyAgain } from '@/features/orders/use-buy-again';

jest.mock('expo-router', () => {
  const push = jest.fn();
  return { useRouter: () => ({ push }), mockPush: push };
});

const { mockPush } = jest.requireMock<{ mockPush: jest.Mock }>('expo-router');

const lineOf = (index: number, productId: string, quantity: number) =>
  ({ index, productId, name: `Product ${productId}`, quantity }) as OrderLine;

const lines = [lineOf(0, 'p-1', 2), lineOf(1, 'p-2', 1), lineOf(2, 'p-3', 3)];

let sent: jest.SpiedFunction<typeof endpoints.setCartLine>;

beforeEach(() => {
  mockPush.mockClear();
  sent = jest.spyOn(endpoints, 'setCartLine').mockResolvedValue({} as Cart);
});
afterEach(() => sent.mockRestore());

function renderBuyAgain() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useBuyAgain(lines), { wrapper });
}

describe('buy again', () => {
  it('sends each line once at its quantity and opens the cart', async () => {
    const again = await renderBuyAgain();

    await act(async () => again.result.current.run());

    expect(sent).toHaveBeenCalledTimes(3);
    expect(sent.mock.calls.map((call) => call[1])).toEqual([
      { productId: 'p-1', variantId: undefined, quantity: 2 },
      { productId: 'p-2', variantId: undefined, quantity: 1 },
      { productId: 'p-3', variantId: undefined, quantity: 3 },
    ]);
    expect(again.result.current.refused).toEqual([]);
    expect(mockPush).toHaveBeenCalledWith('/cart');
  });

  it('lists a refused line with the store’s refusal, adds the rest, and opens the cart on request', async () => {
    const refusal = new ApiError(409, 'CONFLICT', 'Sold out', { reason: 'OUT_OF_STOCK' });
    sent.mockImplementation((_locale, line) =>
      line.productId === 'p-2' ? Promise.reject(refusal) : Promise.resolve({} as Cart)
    );
    const again = await renderBuyAgain();

    await act(async () => again.result.current.run());

    expect(sent).toHaveBeenCalledTimes(3);
    expect(again.result.current.refused).toEqual([{ line: lines[1], error: refusal }]);
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => again.result.current.openCart());

    expect(mockPush).toHaveBeenCalledWith('/cart');
    expect(again.result.current.refused).toEqual([]);
  });

  it('stops and throws when there is no connection', async () => {
    sent.mockRejectedValue(new TypeError('Network request failed'));
    const again = await renderBuyAgain();

    await expect(act(async () => again.result.current.run())).rejects.toThrow(
      'Network request failed'
    );

    expect(sent).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
