import { COMPARE_MAX_PRODUCTS, ProductComparison } from '@/contracts/mobile/shop/v1';

import { dataOf } from './mock-helpers';

describe('the mock store: the comparison', () => {
  it('answers the products asked for, in order, with their specifications lined up', async () => {
    const comparison = await dataOf(
      ProductComparison,
      '/compare?products=everyday-cotton-tee,canvas-weekender-bag'
    );

    expect(comparison.items.map((item) => item.slug)).toEqual([
      'everyday-cotton-tee',
      'canvas-weekender-bag',
    ]);
    for (const row of comparison.rows) expect(row.values).toHaveLength(2);
    // The tee is sold in colours and sizes, the bag is not: its cell is empty.
    expect(comparison.rows.find((row) => row.label === 'Colour')?.values).toEqual([
      'White, Black, Sage',
      '',
    ]);
  });

  it('leaves out what the store does not have, repeats, and what is past the most it holds', async () => {
    const slugs = ['everyday-cotton-tee', 'gone', 'everyday-cotton-tee', 'trail-running-shoes'];
    const comparison = await dataOf(ProductComparison, `/compare?products=${slugs.join(',')}`);
    expect(comparison.items.map((item) => item.slug)).toEqual([
      'everyday-cotton-tee',
      'trail-running-shoes',
    ]);
    expect(COMPARE_MAX_PRODUCTS).toBeGreaterThan(1);
  });

  it('answers an empty comparison for nothing', async () => {
    expect(await dataOf(ProductComparison, '/compare')).toEqual({ items: [], rows: [] });
  });
});
