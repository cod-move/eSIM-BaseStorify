import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import * as endpoints from '@/api/endpoints/products';
import { listProducts } from '@/api/mocks/fixtures/products';
import { Text } from '@/components/ui/text';
import type { ProductList } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { ProductLink } from '../product-link';
import { useOpenProduct } from '../use-open-product';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

let client: QueryClient;

function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
}

/** What the store's search answers: these products, found by their id. */
function searchFinds(...found: { id: string; slug: string }[]) {
  const [template] = listProducts('en');
  if (!template) throw new Error('the mock store has no product');
  const items = found.map((card) => ({ ...template, ...card }));
  const list = { items, nextCursor: null, total: items.length } as ProductList;
  return jest.spyOn(endpoints, 'getProducts').mockResolvedValue(list);
}

beforeEach(() => {
  mockPush.mockClear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => jest.restoreAllMocks());

describe('a product shown as a line', () => {
  it('is a link named by the product that opens its page when the line has its address', async () => {
    const search = searchFinds();

    await render(
      <ProductLink product={{ name: 'Linen shirt', slug: 'linen-shirt', productId: 'p-1' }}>
        <Text>Linen shirt, 1 × $20.00</Text>
      </ProductLink>,
      { wrapper: Providers }
    );
    await fireEvent.press(screen.getByRole('link', { name: 'Linen shirt' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[slug]',
      params: { slug: 'linen-shirt' },
    });
    // The address is known: nothing is looked up.
    expect(search).not.toHaveBeenCalled();
  });

  it('leaves a second way into the same page out of the screen reader, and still opens it', async () => {
    await render(
      <>
        <ProductLink duplicate product={{ name: 'Linen shirt', slug: 'linen-shirt' }}>
          <Text>picture</Text>
        </ProductLink>
        <ProductLink product={{ name: 'Linen shirt', slug: 'linen-shirt' }}>
          <Text>name</Text>
        </ProductLink>
      </>,
      { wrapper: Providers }
    );

    expect(screen.getAllByRole('link', { name: 'Linen shirt' })).toHaveLength(1);
    await fireEvent.press(screen.getByText('picture', { includeHiddenElements: true }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[slug]',
      params: { slug: 'linen-shirt' },
    });
  });
});

describe('a line from a store that does not send the address', () => {
  /** A button that opens the product, so the hook can be pressed. */
  function Opener({ to }: { to?: 'review' }) {
    const open = useOpenProduct();
    return (
      <Text
        accessibilityRole="button"
        onPress={() => open({ name: 'Linen shirt', productId: 'p-1' }, to)}>
        open
      </Text>
    );
  }

  it('finds the product by its name and id in the store, then opens it', async () => {
    const search = searchFinds(
      { id: 'p-9', slug: 'other-shirt' },
      { id: 'p-1', slug: 'linen-shirt' }
    );

    await render(<Opener />, { wrapper: Providers });
    await fireEvent.press(screen.getByRole('button'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/products/[slug]',
        params: { slug: 'linen-shirt' },
      })
    );
    expect(search).toHaveBeenCalledWith('en', { q: 'Linen shirt', limit: 20 }, expect.anything());
  });

  it('opens the write-a-review screen of the product it finds', async () => {
    searchFinds({ id: 'p-1', slug: 'linen-shirt' });

    await render(<Opener to="review" />, { wrapper: Providers });
    await fireEvent.press(screen.getByRole('button'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/products/[slug]/write-review',
        params: { slug: 'linen-shirt' },
      })
    );
  });

  it('opens the search for its name when the store no longer lists the product', async () => {
    searchFinds({ id: 'p-9', slug: 'other-shirt' });

    await render(<Opener />, { wrapper: Providers });
    await fireEvent.press(screen.getByRole('button'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/search', params: { q: 'Linen shirt' } })
    );
  });

  it('opens the search for its name when the store cannot be asked', async () => {
    jest.spyOn(endpoints, 'getProducts').mockRejectedValue(new Error('offline'));

    await render(<Opener />, { wrapper: Providers });
    await fireEvent.press(screen.getByRole('button'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/search', params: { q: 'Linen shirt' } })
    );
  });
});
