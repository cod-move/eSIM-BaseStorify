import {
  BrandDetail,
  Cart,
  CollectionDetail,
  ErrorBody,
  Home,
  ProductFacets,
  ProductList,
  REQUEST_HEADERS,
  VendorDetail,
  Wishlist,
} from '@/contracts/mobile/shop/v1';

import { call, dataOf, signIn } from '../../__tests__/mock-helpers';
import { routes as checkoutRoutes } from '../routes/checkout';
import { routes as paymentsRoutes } from '../routes/payments';
import { resetMockServer } from '../server';

const slugsOf = async (query: string) =>
  (await dataOf(ProductList, `/products?${query}`)).items.map((item) => item.slug);

beforeEach(() => resetMockServer());

describe('the mock store answers as the real one does', () => {
  it('/products/facets answers facets, not a product', async () => {
    const facets = await dataOf(ProductFacets, '/products/facets');
    expect(facets.brands.length).toBeGreaterThan(0);
  });

  it('lists the products of a vendor', async () => {
    const slugs = await slugsOf('vendor=north-trail');
    expect(slugs).toContain('canvas-weekender-bag');
    expect(slugs.length).toBeLessThan((await slugsOf('')).length);
  });

  it('lists the products of a collection', async () => {
    expect(await slugsOf('collection=workday-carry')).toEqual(['commuter-backpack-22l']);
  });

  it('a parent category lists its descendants products too', async () => {
    const parent = await slugsOf('category=electronics');
    expect(parent).toContain('studio-monitor-headphones');
    expect(await slugsOf('category=headphones')).toEqual(['studio-monitor-headphones']);
    expect(parent.length).toBeGreaterThan(1);
  });

  it('answers brands, collections and vendors in the contract shape', async () => {
    await dataOf(BrandDetail, '/brands/fieldnote');
    expect((await dataOf(CollectionDetail, '/collections/summer-edit')).productCount).toBe(6);
    expect((await dataOf(VendorDetail, '/vendors/north-trail')).slug).toBe('north-trail');
    for (const missing of ['/brands/nope', '/collections/nope', '/vendors/nope']) {
      expect((await call(missing)).response.status).toBe(404);
    }
  });

  it('registers POST /checkout/orders once', () => {
    const registered = [...checkoutRoutes, ...paymentsRoutes].filter(
      (route) => route.method === 'POST' && route.path === '/checkout/orders'
    );
    expect(registered).toHaveLength(1);
  });

  it('a refusal carries errors and details like the real envelope', async () => {
    const { headers } = await signIn();
    const invalid = await call('/checkout/orders', {
      method: 'POST',
      headers: { ...headers, [REQUEST_HEADERS.idempotencyKey]: crypto.randomUUID() },
      body: {},
    });
    expect(invalid.response.status).toBe(400);
    expect(ErrorBody.parse(invalid.body).errors).toBeDefined();
  });

  it('Home has product tabs, a product grid and a sponsored rail', async () => {
    const types = (await dataOf(Home, '/home')).blocks.map((block) => block.type);
    expect(types).toEqual(
      expect.arrayContaining(['PRODUCT_TABS', 'PRODUCT_GRID', 'SPONSORED_RAIL'])
    );
  });

  it('the signed-in cart holds items and the wishlist is seeded', async () => {
    const { headers } = await signIn();
    expect((await dataOf(Cart, '/cart', { headers })).lines.length).toBeGreaterThan(0);
    expect((await dataOf(Wishlist, '/wishlist', { headers })).items.length).toBeGreaterThan(0);
  });
});
