import type { ProductDetail } from '@/contracts/mobile/biz/v1';

import { checkChange } from '../product-changes';

const money = (amount: number) => ({ amount, currency: 'USD', formatted: `$${amount}` });

const product = (overrides: Partial<ProductDetail> = {}): ProductDetail => ({
  id: 'p1',
  name: 'Mug',
  status: 'active',
  images: [],
  price: money(10),
  priceOnRequest: false,
  variants: [],
  stock: 4,
  lowStock: true,
  untracked: false,
  locations: [],
  version: '1',
  updatedAt: '2026-10-04T00:00:00.000Z',
  ...overrides,
});

describe('checkChange after a 412', () => {
  const base = product();

  it('sends again when only something else moved the version (a sale)', () => {
    const current = product({ version: '2', stock: 3 });
    expect(checkChange({ price: 12 }, base, current)).toBe('unchanged');
  });

  it('takes a change already made as done (its answer was lost)', () => {
    const current = product({ version: '2', price: money(12) });
    expect(checkChange({ price: 12 }, base, current)).toBe('applied');
  });

  it('reports somebody else changing the same field', () => {
    const current = product({ version: '2', price: money(11) });
    expect(checkChange({ price: 12 }, base, current)).toBe('conflict');
  });

  it('compares only the fields being changed', () => {
    const current = product({ version: '2', price: money(11) });
    expect(checkChange({ status: 'draft' }, base, current)).toBe('unchanged');
  });

  it('reads a cleared compare-at price and variant prices', () => {
    const withVariants = product({
      compareAtPrice: money(15),
      variants: [{ id: 'v1', name: 'Red', price: money(9), stock: 1, locations: [] }],
    });
    expect(checkChange({ compareAtPrice: null }, withVariants, product({ version: '2' }))).toBe(
      'applied'
    );
    const variantMoved = product({
      ...withVariants,
      version: '2',
      variants: [{ id: 'v1', name: 'Red', price: money(8), stock: 1, locations: [] }],
    });
    expect(checkChange({ variants: [{ id: 'v1', price: 9.5 }] }, withVariants, variantMoved)).toBe(
      'conflict'
    );
  });
});
