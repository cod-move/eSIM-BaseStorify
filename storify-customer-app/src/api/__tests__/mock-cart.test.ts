import { Cart } from '@/contracts/mobile/shop/v1';

import { resetMockServer } from '../mocks/server';
import { call, dataOf, signIn } from './mock-helpers';

beforeEach(resetMockServer);

describe('cart', () => {
  const line = { productId: 'prod_leather-card-holder', quantity: 2 };

  it('creates a guest cart with the first line, and finds it again by its token', async () => {
    const created = await dataOf(Cart, '/cart/lines', { method: 'PUT', body: line });
    expect(created.cartToken).toBeTruthy();
    expect(created.itemCount).toBe(2);

    const headers = { 'X-Cart-Token': created.cartToken ?? '' };
    const again = await dataOf(Cart, '/cart', { headers });
    expect(again.lines).toHaveLength(1);
    expect(again.cartToken).toBeUndefined();

    // Setting a quantity twice is the same as setting it once.
    const repeated = await dataOf(Cart, '/cart/lines', { method: 'PUT', body: line, headers });
    expect(repeated.itemCount).toBe(2);

    const emptied = await dataOf(Cart, `/cart/lines/${again.lines[0]?.key}`, {
      method: 'DELETE',
      headers,
    });
    expect(emptied.lines).toHaveLength(0);
  });

  it('refuses what cannot be bought, with a reason', async () => {
    const soldOut = await call('/cart/lines', {
      method: 'PUT',
      body: { productId: 'prod_linen-throw-blanket', quantity: 1 },
    });
    expect(soldOut.response.status).toBe(409);
    expect(soldOut.body).toMatchObject({ success: false, reason: 'OUT_OF_STOCK' });

    const noVariant = await call('/cart/lines', {
      method: 'PUT',
      body: { productId: 'prod_everyday-cotton-tee', quantity: 1 },
    });
    expect(noVariant.body).toMatchObject({ reason: 'VARIANT_REQUIRED' });
  });

  it('moves a guest cart into the account on merge', async () => {
    const guest = await dataOf(Cart, '/cart/lines', {
      method: 'PUT',
      body: { productId: 'prod_leather-card-holder', quantity: 1 },
    });
    const { headers } = await signIn();

    const merged = await dataOf(Cart, '/cart/merge', {
      method: 'POST',
      headers: { ...headers, 'X-Cart-Token': guest.cartToken ?? '' },
    });
    expect(merged.itemCount).toBe(1);

    // The account's cart needs no token from now on.
    expect((await dataOf(Cart, '/cart', { headers })).itemCount).toBe(1);
  });
});
