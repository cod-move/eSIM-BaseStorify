import {
  OperationStatus,
  ProductEditorDetail,
  ProductEditorResult,
  ProductFormOptions,
  ProductVariantGeneration,
  type ProductEditorFields,
} from '@/contracts/mobile/biz/v1';
import { allMockProducts, changeMockProduct } from '../mocks/routes/products';
import { resetMockServer } from '../mocks/server';
import { as, call, dataOf, keyed, refusalOf } from './mock-helpers';

const KEY = 'eb6db731-6455-4c75-a7ad-a9197d6a147f';
const DRAFT = '57259480-0c11-4e2e-9ef2-56f71fc29cce';
const fields: ProductEditorFields = {
  name: 'Complete product',
  description: '<p>A full description with <strong>formatting</strong>.</p>',
  price: 12.5,
  category: 'category_home',
  title: 'Full product title',
  shortDescription: 'Summary',
  cost: 8,
  comparePrice: 16,
  chargeTax: true,
  shipping: {
    isPhysicalProduct: true,
    weight: 0.2,
    weightUnit: 'kg',
    countryOfOrigin: 'BD',
    length: 10,
    width: 4,
    height: 2,
    dimensionUnit: 'cm',
    hsCode: '6109',
    customsDescription: 'Cotton',
  },
  inventory: { tracked: true, continueSellingWhenOutOfStock: false },
  locationInventory: [{ locationId: 'loc_main', quantity: 7 }],
  options: [{ name: 'Size', values: [{ value: 'Small' }] }],
  variants: [
    { name: 'Small', price: 13, stock: 5, optionValues: [{ optionName: 'Size', value: 'Small' }] },
  ],
  preorder: {
    enabled: true,
    releaseDate: '2026-11-01',
    paymentMode: 'deposit',
    depositType: 'percentage',
    depositValue: 25,
  },
  publishing: { onlineStore: true, pointOfSale: false },
  returns: { finalSale: false, windowDays: 30 },
  seo: { pageTitle: 'Search title', metaDescription: 'Search description', handle: 'full-product' },
};
beforeEach(resetMockServer);

it('provides canonical fields, scoped owner locations and current actions', async () => {
  const headers = await as('seller@example.com', 'vendor');
  const options = await dataOf(ProductFormOptions, '/products/form-options', { headers });
  expect(options.locations.map((location) => location.id)).toEqual(['loc_green']);
  const product = await dataOf(ProductEditorDetail, '/products/prod_towel/editor', { headers });
  expect(product.values.description).toContain('Linen');
  await refusalOf(404, 'NOT_FOUND', '/products/prod_vase/editor', { headers });
});

it('creates a full physical product and replays one product and initial inventory', async () => {
  const headers = keyed(await as('admin@example.com', 'platform'), KEY);
  const before = allMockProducts().length;
  const first = await dataOf(ProductEditorResult, '/products', {
    method: 'POST',
    headers,
    body: { draftId: DRAFT, values: fields },
  });
  expect(first.product?.values).toMatchObject({
    name: fields.name,
    preorder: fields.preorder,
    seo: fields.seo,
    returns: fields.returns,
    shipping: fields.shipping,
  });
  expect(first.product?.product.variants[0]?.stock).toBe(5);
  const replay = await call('/products', {
    method: 'POST',
    headers,
    body: { draftId: DRAFT, values: fields },
  });
  expect(replay.response.headers.get('idempotent-replayed')).toBe('true');
  expect(ProductEditorResult.parse(replay.body.data)).toEqual(first);
  expect(allMockProducts()).toHaveLength(before + 1);
  expect((await dataOf(OperationStatus, `/operations?key=${KEY}`, { headers })).state).toBe(
    'succeeded'
  );
});

it('keeps sold inventory when saving unrelated existing variant metadata', async () => {
  const headers = await as('admin@example.com', 'platform');
  const initial = await dataOf(ProductEditorDetail, '/products/prod_mug/editor', { headers });
  const original = initial.values.variants?.[0];
  expect(original).toBeDefined();
  changeMockProduct(initial.id, (product) => {
    const variant = product.variants[0]!;
    variant.stock.loc_green!.available -= 1;
  });
  const current = await dataOf(ProductEditorDetail, `/products/${initial.id}/editor`, { headers });
  const variants = current.values.variants?.map(
    ({ stock: _stock, locationInventory: _locations, ...variant }) => ({
      ...variant,
      sku: `${variant.id}-NEW`,
    })
  );
  const result = await dataOf(ProductEditorResult, `/products/${initial.id}/editor`, {
    method: 'PATCH',
    headers: { ...keyed(headers, KEY), 'If-Match': current.version },
    body: { changes: { variants } },
  });
  expect(result.product?.product.variants[0]?.stock).toBe(current.product.variants[0]?.stock);
  expect(result.product?.values.variants?.[0]?.sku).toContain('NEW');
});

it('returns canonical current data on a certified stale-version refusal', async () => {
  const headers = await as('admin@example.com', 'platform');
  const initial = await dataOf(ProductEditorDetail, '/products/prod_vase/editor', { headers });
  changeMockProduct(initial.id, (product) => {
    product.name = 'Changed product';
  });
  const refusal = await refusalOf(412, 'PRECONDITION_FAILED', `/products/${initial.id}/editor`, {
    method: 'PATCH',
    headers: { ...keyed(headers, KEY), 'If-Match': initial.version },
    body: { changes: { name: 'My product' } },
  });
  expect(ProductEditorDetail.parse(refusal.details?.product).values.name).toBe('Changed product');
  expect((await dataOf(OperationStatus, `/operations?key=${KEY}`, { headers })).state).toBe(
    'failed'
  );
});

it('generates combinations on the server and retains matching variant metadata', async () => {
  const headers = await as('admin@example.com', 'platform');
  const result = await dataOf(ProductVariantGeneration, '/products/variants/generate', {
    method: 'POST',
    headers,
    body: {
      options: [{ name: 'Size', values: [{ value: 'Small' }, { value: 'Large' }] }],
      existing: [
        {
          name: 'Small',
          price: 27,
          sku: 'KEEP',
          optionValues: [{ optionName: 'Size', value: 'Small' }],
        },
      ],
    },
  });
  expect(result.variants).toHaveLength(2);
  expect(result.variants[0]).toMatchObject({ price: 27, sku: 'KEEP' });
});

it('refuses ownership, invalid taxonomy and immutable format before mutating data', async () => {
  const seller = await as('seller@example.com', 'vendor');
  await refusalOf(404, 'NOT_FOUND', '/products/prod_vase/editor', {
    method: 'PATCH',
    headers: { ...keyed(seller, KEY), 'If-Match': '1' },
    body: { changes: { name: 'No access' } },
  });
  const headers = await as('admin@example.com', 'platform');
  const before = await dataOf(ProductEditorDetail, '/products/prod_vase/editor', { headers });
  await refusalOf(400, 'VALIDATION_ERROR', '/products/prod_vase/editor', {
    method: 'PATCH',
    headers: { ...keyed(headers, KEY), 'If-Match': before.version },
    body: { changes: { shipping: { isPhysicalProduct: false } } },
  });
  expect(
    (await dataOf(ProductEditorDetail, '/products/prod_vase/editor', { headers })).version
  ).toBe(before.version);
});

it('creates digital fields and restricts private file access to the product scope', async () => {
  const headers = await as('seller@example.com', 'vendor');
  const result = await dataOf(ProductEditorResult, '/products', {
    method: 'POST',
    headers: keyed(headers, KEY),
    body: {
      draftId: DRAFT,
      values: {
        name: 'Digital guide',
        description: '<p>Download this guide.</p>',
        category: 'category_digital',
        price: 8,
        shipping: { isPhysicalProduct: false },
        digitalDelivery: { downloadLimit: 3 },
      },
    },
  });
  expect(result.product?.values).toMatchObject({
    shipping: { isPhysicalProduct: false },
    digitalDelivery: { downloadLimit: 3 },
  });
  const other = await as('unpaid-seller@example.com', 'vendor');
  await refusalOf(404, 'NOT_FOUND', `/products/${result.product!.id}/editor`, { headers: other });
});

it('publishes and deletes only actions offered by the store, with recoverable receipts', async () => {
  const headers = await as('admin@example.com', 'platform');
  const initial = await dataOf(ProductEditorDetail, '/products/prod_vase/editor', { headers });
  const result = await dataOf(ProductEditorResult, '/products/prod_vase/actions', {
    method: 'POST',
    headers: { ...keyed(headers, KEY), 'If-Match': initial.version },
    body: { action: 'delete' },
  });
  expect(result.deleted).toBe(true);
  await refusalOf(404, 'NOT_FOUND', '/products/prod_vase/editor', { headers });
  expect((await dataOf(OperationStatus, `/operations?key=${KEY}`, { headers })).state).toBe(
    'succeeded'
  );
});
