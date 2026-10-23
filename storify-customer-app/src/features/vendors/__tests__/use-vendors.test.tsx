import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as endpoints from '@/api/endpoints/vendors';
import type { VendorList } from '@/contracts/mobile/shop/v1';
import { useVendors } from '@/features/vendors/use-vendors';

let mockMultiVendor: boolean | undefined;

jest.mock('@/features/config/use-config', () => ({
  useConfig: () => ({
    data:
      mockMultiVendor === undefined ? undefined : { features: { multiVendor: mockMultiVendor } },
  }),
}));

let asked: jest.SpiedFunction<typeof endpoints.getVendors>;

beforeEach(() => {
  asked = jest
    .spyOn(endpoints, 'getVendors')
    .mockResolvedValue({ items: [], nextCursor: null } satisfies VendorList);
});
afterEach(() => asked.mockRestore());

function renderVendors() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useVendors(), { wrapper });
}

describe('the list of vendors', () => {
  it('is not available, and never asked of the API, in a store without several sellers', async () => {
    mockMultiVendor = false;
    const { result } = await renderVendors();

    expect(result.current.available).toBe(false);
    expect(asked).not.toHaveBeenCalled();
  });

  it('waits for the settings before it says anything', async () => {
    mockMultiVendor = undefined;
    const { result } = await renderVendors();

    expect(result.current.available).toBeUndefined();
    expect(asked).not.toHaveBeenCalled();
  });

  it('is asked of a store with several sellers', async () => {
    mockMultiVendor = true;
    const { result } = await renderVendors();

    expect(result.current.available).toBe(true);
    expect(asked).toHaveBeenCalledTimes(1);
  });
});
