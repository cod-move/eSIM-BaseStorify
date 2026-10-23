import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { IntlProvider } from 'use-intl';

import { resetMockServer } from '@/api/mocks/server';
import { queryKeys } from '@/api/query-keys';
import type { Cart } from '@/contracts/mobile/shop/v1';
import { Listing } from '@/features/browse/listing';
import { getMessages } from '@/i18n/messages';
import { loadPluralRules } from '@/i18n/polyfills';

jest.setTimeout(30_000);

beforeEach(resetMockServer);

/** The product list on the mock store, as a shopper who is not signed in sees it. */
async function showListing() {
  await loadPluralRules('en');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = renderRouter(
    {
      index: () => (
        <QueryClientProvider client={client}>
          <IntlProvider locale="en" messages={getMessages('en')}>
            <Listing query={{}} />
          </IntlProvider>
        </QueryClientProvider>
      ),
      login: () => null,
    },
    { initialUrl: '/' }
  );
  await app;
  return { client, pathname: () => app.getPathname() };
}

describe('the cart button and the heart on a listing card', () => {
  it('adds the product to the cart', async () => {
    const { client } = await showListing();

    const [addButton] = await screen.findAllByRole('button', { name: 'Add to Cart' });
    expect(addButton).toBeTruthy();
    await fireEvent.press(addButton as NonNullable<typeof addButton>);

    await waitFor(() => {
      const cart = client.getQueryData<{ data: Cart }>(queryKeys.cart('en'))?.data;
      expect(cart?.lines).toHaveLength(1);
      expect(cart?.itemCount).toBe(1);
    });
  });

  it('sends a guest who taps the heart to sign in', async () => {
    const { pathname } = await showListing();

    await screen.findAllByRole('button', { name: 'Add to Cart' });
    const [heart] = await screen.findAllByRole('button', { name: 'Add to wishlist' });
    await fireEvent.press(heart as NonNullable<typeof heart>);

    await waitFor(() => expect(pathname()).toBe('/login'));
  });
});
