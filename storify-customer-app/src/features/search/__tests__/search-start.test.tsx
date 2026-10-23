import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { openApp } from '@/__tests__/helpers';
import { routes as productRoutes } from '@/api/mocks/routes/products';
import { routes } from '@/api/mocks/routes/search-start';
import type { SearchStart } from '@/contracts/mobile/shop/v1';

const [publicRoute, meRoute] = routes;

afterEach(() => jest.restoreAllMocks());

/** The store answers GET /search/start with these lists. */
function storeSends(start: SearchStart) {
  jest.spyOn(publicRoute!, 'handle').mockReturnValue(start);
}

const POPULAR: SearchStart['popularCategories'] = [
  { id: 'cat_lamps', slug: 'lamps', name: 'Lamps', children: [] },
];

describe('the search start page', () => {
  it('never asks a guest for the "For you" shelf', async () => {
    const me = jest.spyOn(meRoute!, 'handle');
    await openApp('/search');

    await screen.findByRole('button', { name: 'earbuds' });
    expect(me).not.toHaveBeenCalled();
    expect(screen.queryByText('For You')).toBeNull();
  });

  it('hides the trending row when the store sends no terms', async () => {
    storeSends({ trending: [], popularCategories: POPULAR });
    await openApp('/search');

    await screen.findByText('Popular Category');
    expect(screen.queryByText('Trending')).toBeNull();
  });

  it('hides "Popular Category" when the store sends no categories', async () => {
    storeSends({ trending: ['desk lamp'], popularCategories: [] });
    await openApp('/search');

    await screen.findByText('Trending');
    expect(screen.queryByText('Popular Category')).toBeNull();
  });

  it('searches a trending term as the store typed it', async () => {
    storeSends({ trending: ['desk lamp'], popularCategories: [] });
    const list = jest.spyOn(productRoutes[0]!, 'handle');
    const app = await openApp('/search');

    await fireEvent.press(await screen.findByRole('button', { name: 'desk lamp' }));

    await waitFor(() => expect(app.pathname()).toBe('/products'));
    await waitFor(() =>
      expect(list.mock.calls.some(([ctx]) => ctx.query.get('q') === 'desk lamp')).toBe(true)
    );
  });
});
