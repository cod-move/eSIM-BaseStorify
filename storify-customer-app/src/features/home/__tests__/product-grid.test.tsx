import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { ProductCard as ProductCardData, ProductGridBlock } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { ProductGrid } from '../blocks/product-grid';

jest.mock('@/features/catalog/product-card', () => ({
  ProductCard: ({ product }: { product: { name: string } }) => {
    const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <NativeText>{product.name}</NativeText>;
  },
}));
jest.mock('@/features/catalog/use-add-from-card', () => ({ useCardActions: () => () => ({}) }));
jest.mock('@/i18n/locale-store', () => ({ useLocale: () => 'en' }));
jest.mock('@/api/endpoints/products', () => ({ getProducts: jest.fn() }));

function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
}

const product = (n: number) =>
  ({ id: `p${n}`, name: `Product ${n}` }) as unknown as ProductCardData;

const grid = (browse: ProductGridBlock['browse']): ProductGridBlock => ({
  type: 'PRODUCT_GRID',
  id: 'grid',
  products: [product(1), product(2), product(3), product(4)],
  browse,
});

describe('ProductGrid', () => {
  it('stops at the size the store gave it', async () => {
    await render(
      <ProductGrid
        block={grid({ categories: [], pageSize: 4, nextCursor: 'c2', maxProducts: 2 })}
      />,
      { wrapper: Providers }
    );

    expect(screen.getByText('Product 2')).toBeTruthy();
    expect(screen.queryByText('Product 3')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers more while it is short of that size', async () => {
    await render(
      <ProductGrid
        block={grid({ categories: [], pageSize: 4, nextCursor: 'c2', maxProducts: 8 })}
      />,
      { wrapper: Providers }
    );

    expect(screen.getByText('Product 4')).toBeTruthy();
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('pages on with no size', async () => {
    await render(<ProductGrid block={grid({ categories: [], pageSize: 4, nextCursor: 'c2' })} />, {
      wrapper: Providers,
    });

    expect(screen.getByRole('button')).toBeTruthy();
  });
});
