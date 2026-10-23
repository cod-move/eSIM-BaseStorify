import { CategoryTree, ProductDetail, ProductList } from '@/contracts/mobile/shop/v1';

import { resetMockServer } from '../mocks/server';
import { dataOf } from './mock-helpers';

beforeEach(resetMockServer);

describe('catalogue', () => {
  it('answers /categories', async () => {
    const tree = await dataOf(CategoryTree, '/categories');
    expect(tree.items.length).toBeGreaterThan(0);
  });

  it('pages through /products with a cursor', async () => {
    const first = await dataOf(ProductList, '/products?limit=10');
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).not.toBeNull();

    const second = await dataOf(ProductList, `/products?limit=10&cursor=${first.nextCursor}`);
    expect(second.nextCursor).toBeNull();
    expect(second.items.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(first.items.map((item) => item.id))
    );
  });

  it('filters /products', async () => {
    const bags = await dataOf(ProductList, '/products?category=bags');
    expect(bags.items.length).toBeGreaterThan(0);

    const sale = await dataOf(ProductList, '/products?onSale=true');
    expect(sale.items.every((item) => item.compareAtPrice)).toBe(true);
  });

  it('answers every product page', async () => {
    const list = await dataOf(ProductList, '/products?limit=40');
    for (const card of list.items) {
      const product = await dataOf(ProductDetail, `/products/${card.slug}`);
      expect(product.id).toBe(card.id);
    }
  });
});
