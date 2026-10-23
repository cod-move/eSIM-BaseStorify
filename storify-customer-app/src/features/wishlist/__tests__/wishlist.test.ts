import { Wishlist, WishlistChange } from '@/contracts/mobile/shop/v1';
import { call, dataOf, signIn } from '@/api/__tests__/mock-helpers';
import { resetMockServer } from '@/api/mocks/server';

import { withoutProduct } from '../use-wishlist';

beforeEach(resetMockServer);

describe('the mock store wishlist', () => {
  it('is closed to a guest', async () => {
    const { response } = await call('/wishlist');
    expect(response.status).toBe(401);
  });

  it('lists the saved products newest first, page by page', async () => {
    const { headers } = await signIn();
    // The first look seeds the mock shopper's wishlist; a product saved after it comes first.
    await dataOf(Wishlist, '/wishlist', { headers });
    const productId = 'prod_leather-card-holder';
    await dataOf(WishlistChange, `/wishlist/${productId}`, { method: 'PUT', headers });

    const first = await dataOf(Wishlist, '/wishlist?limit=2', { headers });
    expect(first.items).toHaveLength(2);
    expect(first.items[0]?.product.id).toBe(productId);
    expect(first.nextCursor).not.toBeNull();

    const rest = await dataOf(Wishlist, `/wishlist?limit=40&cursor=${first.nextCursor}`, {
      headers,
    });
    expect(rest.nextCursor).toBeNull();
    const ids = [...first.items, ...rest.items].map((item) => item.product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves out a product once it is removed', async () => {
    const { headers } = await signIn();
    const before = await dataOf(Wishlist, '/wishlist', { headers });
    const removed = before.items[0]?.product.id ?? '';
    await dataOf(WishlistChange, `/wishlist/${removed}`, { method: 'DELETE', headers });

    const after = await dataOf(Wishlist, '/wishlist', { headers });
    expect(after.items.map((item) => item.product.id)).not.toContain(removed);
    expect(after.items).toHaveLength(before.items.length - 1);
  });
});

describe('withoutProduct', () => {
  it('takes the product out of every page and keeps the cursors', async () => {
    const { headers } = await signIn();
    const page = await dataOf(Wishlist, '/wishlist', { headers });
    const target = page.items[1]?.product.id ?? '';
    const data = { pages: [page, page], pageParams: [undefined, 'next'] };

    const next = withoutProduct(data, target);
    expect(next.pageParams).toEqual(data.pageParams);
    for (const p of next.pages) {
      expect(p.items.map((item) => item.product.id)).not.toContain(target);
      expect(p.items).toHaveLength(page.items.length - 1);
      expect(p.nextCursor).toBe(page.nextCursor);
    }
  });
});
