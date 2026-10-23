import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { shareAsync } from 'expo-sharing';
import type { ReactNode } from 'react';

import { ApiError } from '@/api/errors';
import * as endpoints from '@/api/endpoints/orders';
import { useReceipt } from '@/features/orders/use-receipt';

jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-file-system', () => {
  const written: { uri: string; bytes: Uint8Array }[] = [];
  return {
    Paths: { cache: 'file:///cache' },
    File: class {
      uri: string;
      constructor(directory: string, name: string) {
        this.uri = `${directory}/${name}`;
      }
      create(): void {
        return undefined;
      }
      write(bytes: Uint8Array): void {
        written.push({ uri: this.uri, bytes });
      }
    },
    mockWritten: written,
  };
});

const { mockWritten } = jest.requireMock<{ mockWritten: { uri: string; bytes: Uint8Array }[] }>(
  'expo-file-system'
);

function renderReceipt() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useReceipt({ orderId: 'o-1' }), { wrapper });
}

beforeEach(() => {
  mockWritten.length = 0;
  jest.mocked(shareAsync).mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe('the e-receipt', () => {
  it('writes the invoice to the cache and opens it', async () => {
    jest.spyOn(endpoints, 'getInvoice').mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const receipt = await renderReceipt();

    await act(async () => receipt.result.current.mutateAsync());

    expect(mockWritten).toHaveLength(1);
    expect(mockWritten[0]?.uri).toBe('file:///cache/invoice-o-1.pdf');
    expect(Array.from(mockWritten[0]?.bytes ?? [])).toEqual([37, 80, 68, 70]);
    expect(shareAsync).toHaveBeenCalledWith('file:///cache/invoice-o-1.pdf', {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
  });

  it('is an error, and opens nothing, when the store refuses', async () => {
    jest
      .spyOn(endpoints, 'getInvoice')
      .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No such order'));
    const receipt = await renderReceipt();

    await act(async () => {
      await receipt.result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(receipt.result.current.isError).toBe(true));
    expect(mockWritten).toHaveLength(0);
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
