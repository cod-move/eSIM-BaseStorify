import {
  ProductDetail,
  ProductFilterOptions,
  ProductList,
  ProductStock,
  StockMovementList,
} from '@/contracts/mobile/biz/v1';

import { changeMockProduct } from '../mocks/routes/products';
import { resetMockServer } from '../mocks/server';
import { as, call, dataOf, keyed, refusalOf } from './mock-helpers';

beforeEach(resetMockServer);

describe('finding products', () => {
  it("lists the store's every product for its operators, a seller's own for the seller", async () => {
    const all = await dataOf(ProductList, '/products', { headers: await as('admin@example.com') });
    expect(all.items.find((product) => product.id === 'prod_towel')?.vendorName).toBe(
      'Green Leaf Goods'
    );

    const own = await dataOf(ProductList, '/products', { headers: await as('seller@example.com') });
    expect(own.items.every((product) => product.vendorName === undefined)).toBe(true);
    expect(own.items.map((product) => product.id)).not.toContain('prod_vase');
  });

  it('finds a product by what the scanner read, as the register cleans it', async () => {
    const headers = await as('admin@example.com');
    // A UPC-A read in its EAN-13 form, with a newline the scanner added.
    const upc = await dataOf(
      ProductList,
      `/products?barcode=${encodeURIComponent('0036000291452\n')}`,
      {
        headers,
      }
    );
    expect(upc).toMatchObject({ items: [{ id: 'prod_towel' }], nextCursor: null });

    const code128 = await dataOf(ProductList, '/products?barcode=tote-cnv-01', { headers });
    expect(code128.items.map((product) => product.id)).toEqual(['prod_tote']);

    const variant = await dataOf(ProductList, '/products?barcode=5901234123464', { headers });
    expect(variant.items.map((product) => product.id)).toEqual(['prod_mug']);
  });

  it('lists the products low on stock, and leaves the price out on request', async () => {
    const headers = await as('admin@example.com');
    const low = await dataOf(ProductList, '/products?lowStock=true', { headers });
    expect(low.items.every((product) => product.lowStock)).toBe(true);
    expect(low.items.map((product) => product.id)).toEqual(
      expect.arrayContaining(['prod_towel', 'prod_jacket'])
    );
    expect(low.items.find((product) => product.id === 'prod_jacket')?.price).toBeUndefined();
  });

  it('narrows by a category with the ones under it, a brand and a collection', async () => {
    const headers = await as('admin@example.com');
    const ids = async (query: string) =>
      (await dataOf(ProductList, `/products?limit=40&${query}`, { headers })).items.map(
        (product) => product.id
      );

    // Home & living takes in Kitchen and Decor (and Vases, Candles under it).
    expect(await ids('categoryId=cat_home')).toEqual(
      expect.arrayContaining(['prod_vase', 'prod_towel', 'prod_mug', 'prod_candle', 'prod_basket'])
    );
    expect(await ids('categoryId=cat_kitchen')).toEqual(['prod_towel', 'prod_mug']);
    expect(await ids('brandId=brand_urban')).toEqual(['prod_tee', 'prod_jacket']);
    expect(await ids('collectionId=col_best&categoryId=cat_kitchen')).toEqual(['prod_mug']);
    expect(await ids('categoryId=cat_unknown')).toEqual([]);
  });

  it("offers what the operator's own products can be narrowed by", async () => {
    const all = await dataOf(ProductFilterOptions, '/products/filters', {
      headers: await as('admin@example.com'),
    });
    expect(all.categories.find((category) => category.id === 'cat_kitchen')).toEqual({
      id: 'cat_kitchen',
      name: 'Kitchen',
      parentId: 'cat_home',
    });
    // No product sits in Toys.
    expect(all.categories.map((category) => category.id)).not.toContain('cat_toys');

    const own = await dataOf(ProductFilterOptions, '/products/filters', {
      headers: await as('seller@example.com'),
    });
    expect(own.brands.map((brand) => brand.id)).toEqual(['brand_green']);
    expect(own.categories.map((category) => category.id)).not.toContain('cat_clothing');
  });
});

describe('changing a product', () => {
  it('answers the version as the ETag, and changes against it only', async () => {
    const headers = await as('admin@example.com');
    const { response, body } = await call('/products/prod_vase', { headers });
    const product = ProductDetail.parse(body.data);
    expect(response.headers.get('etag')).toBe(`"${product.version}"`);

    await refusalOf(428, 'PRECONDITION_REQUIRED', '/products/prod_vase', {
      method: 'PATCH',
      headers,
      body: { price: 30 },
    });

    const changed = await dataOf(ProductDetail, '/products/prod_vase', {
      method: 'PATCH',
      headers: { ...headers, 'If-Match': response.headers.get('etag') ?? '' },
      body: { price: 30, compareAtPrice: 35 },
    });
    expect(changed.price?.amount).toBe(30);
    expect(changed.version).not.toBe(product.version);

    await refusalOf(412, 'PRECONDITION_FAILED', '/products/prod_vase', {
      method: 'PATCH',
      headers: { ...headers, 'If-Match': product.version },
      body: { price: 31 },
    });
  });

  it('prices a product with variants per variant, and never one on request', async () => {
    const headers = await as('seller@example.com');
    const mug = await dataOf(ProductDetail, '/products/prod_mug', { headers });
    const product = await refusalOf(400, 'VALIDATION_ERROR', '/products/prod_mug', {
      method: 'PATCH',
      headers: { ...headers, 'If-Match': mug.version },
      body: { price: 10 },
    });
    expect(product.reason).toBe('VARIANT_PRICES');

    const priced = await dataOf(ProductDetail, '/products/prod_mug', {
      method: 'PATCH',
      headers: { ...headers, 'If-Match': mug.version },
      body: { variants: [{ id: 'var_mug_sage', price: 17, compareAtPrice: null }] },
    });
    expect(priced.variants[0]?.price?.amount).toBe(17);

    const admin = await as('admin@example.com');
    const jacket = await dataOf(ProductDetail, '/products/prod_jacket', { headers: admin });
    expect(jacket.priceOnRequest).toBe(true);
    const onRequest = await refusalOf(409, 'CONFLICT', '/products/prod_jacket', {
      method: 'PATCH',
      headers: { ...admin, 'If-Match': jacket.version },
      body: { price: 99 },
    });
    expect(onRequest.reason).toBe('PRICE_ON_REQUEST');
  });

  it('moves the version when somebody else writes to the product', async () => {
    const headers = await as('admin@example.com');
    const before = await dataOf(ProductDetail, '/products/prod_candle', { headers });
    changeMockProduct('prod_candle', () => {});
    const after = await dataOf(ProductDetail, '/products/prod_candle', { headers });
    expect(after.version).not.toBe(before.version);
  });
});

describe('stock', () => {
  it('breaks a product down into available, committed, unavailable and on hand', async () => {
    const stock = await dataOf(ProductStock, '/products/prod_mug/stock', {
      headers: await as('seller@example.com'),
    });
    expect(stock.rows.map((row) => row.name)).toEqual(['Sage', 'Sand', 'Charcoal']);
    for (const row of stock.rows) {
      expect(row.onHand).toBe(row.available + row.committed + row.unavailable);
    }
  });

  it('counts units in or out once per key, never below zero', async () => {
    const headers = await as('seller-staff@example.com');
    const add = (key: string, delta: number) =>
      call('/products/prod_towel/stock-adjustments', {
        method: 'POST',
        headers: keyed(headers, key),
        body: { locationId: 'loc_green', delta, reason: 'received' },
      });

    // 3 on the shelf; +5, and the same tap's retry, count once.
    await add('k1', 5);
    const retried = ProductStock.parse((await add('k1', 5)).body.data);
    expect(retried.rows[0]?.available).toBe(8);
    expect(
      (await dataOf(ProductStock, '/products/prod_towel/stock', { headers })).rows[0]?.available
    ).toBe(8);

    const emptied = ProductStock.parse((await add('k2', -100)).body.data);
    expect(emptied.rows[0]?.available).toBe(0);
  });

  it('refuses a location of somebody else, a missing variant, and an untracked product', async () => {
    const headers = keyed(await as('admin@example.com'), 'k1');
    const elsewhere = await refusalOf(
      403,
      'AUTHORIZATION_ERROR',
      '/products/prod_vase/stock-adjustments',
      {
        method: 'POST',
        headers,
        body: { locationId: 'loc_green', delta: 1, reason: 'count' },
      }
    );
    expect(elsewhere.reason).toBe('LOCATION_NOT_ALLOWED');

    const variant = await refusalOf(
      400,
      'VALIDATION_ERROR',
      '/products/prod_mug/stock-adjustments',
      {
        method: 'POST',
        headers: keyed(headers, 'k2'),
        body: { locationId: 'loc_green', delta: 1, reason: 'count' },
      }
    );
    expect(variant.reason).toBe('VARIANT_REQUIRED');

    const untracked = await refusalOf(409, 'CONFLICT', '/products/prod_guide/stock-adjustments', {
      method: 'POST',
      headers: keyed(headers, 'k3'),
      body: { locationId: 'loc_main', delta: 1, reason: 'count' },
    });
    expect(untracked.reason).toBe('UNTRACKED');
  });
});

describe('stock history', () => {
  const history = (path: string, headers: Record<string, string>) =>
    dataOf(StockMovementList, `/products/${path}`, { headers });

  it('lists what moved the stock, newest first, with who, where and the count after', async () => {
    const page = await history('prod_vase/stock-movements', await as('admin@example.com'));

    expect(page.nextCursor).toBeNull();
    const times = page.items.map((item) => item.at);
    expect(times).toEqual([...times].sort().reverse());
    expect(page.items[0]).toMatchObject({
      kind: 'adjustment',
      change: 6,
      quantityAfter: 18,
      locationName: 'Main warehouse',
      reason: 'received',
      note: 'Kiln delivery, batch 14',
      actor: { kind: 'person', name: 'Amina Rahman', role: 'admin' },
    });
    expect(new Set(page.items.map((item) => item.kind))).toEqual(
      new Set([
        'adjustment',
        'transfer_received',
        'transfer_shipped',
        'transfer_cancelled',
        'return_restocked',
      ])
    );
  });

  it('narrows to one location, or one variant', async () => {
    const headers = await as('seller@example.com');
    const popup = await history(
      'prod_vase/stock-movements?locationId=loc_popup',
      await as('admin@example.com')
    );
    expect(popup.items.length).toBeGreaterThan(0);
    expect(popup.items.every((item) => item.locationId === 'loc_popup')).toBe(true);

    const sand = await history('prod_mug/stock-movements?variantId=var_mug_sand', headers);
    expect(sand.items.every((item) => item.variantName === 'Sand')).toBe(true);

    const unknown = await refusalOf(
      400,
      'VALIDATION_ERROR',
      '/products/prod_mug/stock-movements?variantId=var_tee_s',
      { headers }
    );
    expect(unknown.reason).toBe('UNKNOWN_VARIANT');
  });

  it('pages a long history without a repeat', async () => {
    const headers = await as('seller@example.com');
    const first = await history('prod_mug/stock-movements', headers);
    expect(first.items).toHaveLength(20);
    const second = await history(
      `prod_mug/stock-movements?cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      headers
    );
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows a seller the store's team unnamed, and without its note", async () => {
    const page = await history('prod_towel/stock-movements', await as('seller@example.com'));
    expect(page.items.map((item) => item.actor)).toEqual([
      { kind: 'person', name: 'Nadia Chowdhury', role: 'vendor' },
      { kind: 'store' },
    ]);
    expect(page.items[1]?.note).toBeUndefined();
  });

  it("keeps a staff member assigned to a location to that location's stock", async () => {
    const headers = await as('warehouse@example.com');

    const page = await history('prod_vase/stock-movements', headers);
    expect(page.items.length).toBeGreaterThan(0);
    // Nothing at the pop-up, and nothing recorded without a location.
    expect(page.items.every((item) => item.locationId === 'loc_main')).toBe(true);

    const popup = await refusalOf(
      403,
      'AUTHORIZATION_ERROR',
      '/products/prod_vase/stock-movements?locationId=loc_popup',
      { headers }
    );
    expect(popup.reason).toBe('LOCATION_NOT_ALLOWED');

    // Its stock there only, and no adjusting another location's.
    const stock = await dataOf(ProductStock, '/products/prod_vase/stock', { headers });
    expect(stock.rows[0]?.locations.map((location) => location.name)).toEqual(['Main warehouse']);
    const elsewhere = await refusalOf(
      403,
      'AUTHORIZATION_ERROR',
      '/products/prod_vase/stock-adjustments',
      {
        method: 'POST',
        headers: keyed(headers, 'k1'),
        body: { locationId: 'loc_popup', delta: 1, reason: 'count' },
      }
    );
    expect(elsewhere.reason).toBe('LOCATION_NOT_ALLOWED');

    // A seller's product, stocked elsewhere, is out of reach.
    await refusalOf(404, 'NOT_FOUND', '/products/prod_towel/stock-movements', { headers });
  });

  it('records an adjustment as it went through, at the top', async () => {
    const headers = await as('seller-staff@example.com');
    await call('/products/prod_towel/stock-adjustments', {
      method: 'POST',
      headers: keyed(headers, 'k1'),
      body: { locationId: 'loc_green', delta: -100, reason: 'damaged', note: 'Flooded shelf' },
    });

    const page = await history('prod_towel/stock-movements', headers);
    expect(page.items[0]).toMatchObject({
      kind: 'adjustment',
      // 3 were there: what it took, not what was asked.
      change: -3,
      quantityAfter: 0,
      reason: 'damaged',
      note: 'Flooded shelf',
      actor: { kind: 'person', name: 'Rafi Ahmed', role: 'staff' },
    });
  });
});
