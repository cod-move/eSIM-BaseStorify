import type { Money, ProductDetail, ProductVariant } from '@/contracts/mobile/biz/v1';

import { changesSince } from '../product-changes';
import { changesOf, formKeyOf, formOf, withCurrentValues } from '../product-form';
import { readPrice, readUnits } from '../typed-input';

const usd = (amount: number): Money => ({
  amount,
  currency: 'USD',
  formatted: `$${amount.toFixed(2)}`,
});

function product(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 'prod_1',
    name: 'Vase',
    status: 'active',
    images: [],
    price: usd(24),
    priceOnRequest: false,
    variants: [],
    stock: 10,
    lowStock: false,
    untracked: false,
    locations: [],
    version: '1',
    updatedAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  };
}

const variant = (id: string, price: number, compareAt?: number): ProductVariant => ({
  id,
  name: id,
  price: usd(price),
  ...(compareAt === undefined ? {} : { compareAtPrice: usd(compareAt) }),
  stock: 3,
  locations: [],
});

describe('reading what was typed', () => {
  it.each([
    ['12.5', 12.5],
    ['12,50', 12.5],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['1,234,567', 1234567],
    [' 7 ', 7],
    ['০১২.৫', 12.5],
    ['١٢٫٥', 12.5],
    ['0', 0],
  ])('reads "%s" as %d', (typed, value) => {
    expect(readPrice(typed)).toEqual({ kind: 'price', value });
  });

  it.each(['-3', '12.5.1', 'abc', '$12', '1e3'])('refuses "%s"', (typed) => {
    expect(readPrice(typed)).toEqual({ kind: 'invalid' });
  });

  it('tells an empty field from a wrong one', () => {
    expect(readPrice('  ')).toEqual({ kind: 'empty' });
  });

  it('reads whole units only', () => {
    expect(readUnits('12')).toBe(12);
    expect(readUnits('১২')).toBe(12);
    expect(readUnits('1.5')).toBeNull();
    expect(readUnits('')).toBeNull();
  });
});

describe('the change a quick edit makes', () => {
  it('sends only what differs from where the edit started', () => {
    const base = product({ compareAtPrice: usd(30) });
    expect(changesOf(base, formOf(base)).changes).toEqual({});

    const form = { ...formOf(base), price: '26', status: 'draft' };
    expect(changesOf(base, form)).toEqual({ changes: { price: 26, status: 'draft' }, errors: {} });
  });

  it('clears a compare-at price left empty, and never a price', () => {
    const base = product({ compareAtPrice: usd(30) });
    const { changes, errors } = changesOf(base, {
      ...formOf(base),
      price: '',
      compareAtPrice: '',
    });
    expect(changes).toEqual({ compareAtPrice: null });
    expect(errors).toEqual({ price: 'missing' });
  });

  it('prices a product with variants per variant', () => {
    const base = product({
      price: undefined,
      variants: [variant('sage', 16), variant('sand', 16, 20)],
    });
    const form = formOf(base);
    form.variants.sage = { price: '17', compareAtPrice: '' };
    form.variants.sand = { price: '16', compareAtPrice: '' };
    expect(changesOf(base, form).changes).toEqual({
      variants: [
        { id: 'sage', price: 17 },
        { id: 'sand', compareAtPrice: null },
      ],
    });

    form.variants.sage = { price: 'x', compareAtPrice: '' };
    expect(changesOf(base, form).errors).toEqual({ 'sage.price': 'invalid' });
  });

  it('changes only the status of a product priced on request', () => {
    const base = product({ price: undefined, priceOnRequest: true });
    const form = { ...formOf(base), price: '99', status: 'unlisted' };
    expect(changesOf(base, form).changes).toEqual({ status: 'unlisted' });
  });

  it('puts the field a store refusal names back on its form key', () => {
    const changes = { variants: [{ id: 'sage', price: 1 }] };
    expect(formKeyOf('variants.0.price', changes)).toBe('sage.price');
    expect(formKeyOf('price', changes)).toBe('price');
    expect(formKeyOf('variants.3.price', changes)).toBeNull();
    expect(formKeyOf('preorder', changes)).toBeNull();
  });
});

describe('after somebody else changed the same fields', () => {
  it('says what they changed, and shows their values in those fields only', () => {
    const base = product({ variants: [], compareAtPrice: usd(30) });
    const form = { ...formOf(base), price: '28', compareAtPrice: '35', status: 'draft' };
    const { changes } = changesOf(base, form);
    const current = { ...base, price: usd(26), status: 'unlisted', version: '2' };

    const changed = changesSince(changes, base, current);
    expect(changed).toEqual([
      expect.objectContaining({ key: 'status', before: 'active', after: 'unlisted' }),
      expect.objectContaining({ key: 'price', before: usd(24), after: usd(26) }),
    ]);

    const next = withCurrentValues(form, changed);
    expect(next).toMatchObject({ price: '26', status: 'unlisted', compareAtPrice: '35' });
    // Against the product as it is now, only the operator's own edit is left to send.
    expect(changesOf(current, next).changes).toEqual({ compareAtPrice: 35 });
  });
});
