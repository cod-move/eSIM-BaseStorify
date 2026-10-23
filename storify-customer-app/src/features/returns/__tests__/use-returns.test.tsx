import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as endpoints from '@/api/endpoints/returns';
import { NetworkError } from '@/api/errors';
import type {
  CreateReturnRequest,
  CreatedReturns,
  ReturnPreview,
  ReturnPreviewRequest,
} from '@/contracts/mobile/shop/v1';
import { useReturnPreview, useSubmitReturn } from '@/features/returns/use-returns';

import { money } from './order';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function previewOf(total: string): ReturnPreview {
  const refund = {
    items: money(100, total),
    discount: money(0, '৳0.00'),
    tax: money(0, '৳0.00'),
    shipping: money(0, '৳0.00'),
    restockingFee: money(0, '৳0.00'),
    returnShippingFee: money(0, '৳0.00'),
    total: money(100, total),
  };
  return {
    parcels: [{ lines: [{ index: 0, name: 'Tee', quantity: 1 }], refund }],
    total: money(100, total),
    storeAtFault: false,
    refundDestinationRequired: true,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('the refund preview', () => {
  it('is asked again when the selection changes, and is the answer as sent', async () => {
    const first = previewOf('৳95.00');
    const second = previewOf('৳190.00');
    const preview = jest
      .spyOn(endpoints, 'previewReturn')
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const one: ReturnPreviewRequest = { lines: [{ index: 0, quantity: 1 }], reason: 'other' };
    const two: ReturnPreviewRequest = { lines: [{ index: 0, quantity: 2 }], reason: 'other' };
    const hook = await renderHook(
      ({ request }: { request: ReturnPreviewRequest | null }) => useReturnPreview('o-1', request),
      { wrapper: wrapper(), initialProps: { request: null as ReturnPreviewRequest | null } }
    );

    // Nothing chosen yet: nothing asked.
    expect(preview).not.toHaveBeenCalled();

    await hook.rerender({ request: one });
    await waitFor(() => expect(hook.result.current.data).toEqual(first));

    await hook.rerender({ request: two });
    await waitFor(() => expect(hook.result.current.data).toEqual(second));

    expect(preview).toHaveBeenCalledTimes(2);
    expect(preview.mock.calls.map(([, , body]) => body)).toEqual([one, two]);
    expect(hook.result.current.data?.total.formatted).toBe('৳190.00');
  });
});

describe('submitting the request', () => {
  const body: CreateReturnRequest = {
    lines: [{ index: 0, quantity: 1 }],
    reason: 'other',
    note: 'Too small',
    refundDestination: { method: 'cash' },
  };
  const made: CreatedReturns = { returns: [] };

  it('sends the same Idempotency-Key on a retry, and nothing after the answer', async () => {
    const create = jest
      .spyOn(endpoints, 'createReturn')
      .mockRejectedValueOnce(new NetworkError('offline'))
      .mockResolvedValueOnce(made);
    let keys = 0;
    const hook = await renderHook(() => useSubmitReturn('o-1', () => `key-${++keys}`), {
      wrapper: wrapper(),
    });

    await act(async () => hook.result.current.submit(body));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));

    await act(async () => hook.result.current.submit(body));
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    await act(async () => hook.result.current.submit(body));

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map(([, , , key]) => key)).toEqual(['key-1', 'key-1']);
    expect(keys).toBe(1);
  });

  it('sends a double tap once', async () => {
    const create = jest.spyOn(endpoints, 'createReturn').mockResolvedValue(made);
    const hook = await renderHook(() => useSubmitReturn('o-1', () => 'key'), {
      wrapper: wrapper(),
    });

    await act(async () => {
      hook.result.current.submit(body);
      hook.result.current.submit(body);
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    expect(create).toHaveBeenCalledTimes(1);
  });
});
