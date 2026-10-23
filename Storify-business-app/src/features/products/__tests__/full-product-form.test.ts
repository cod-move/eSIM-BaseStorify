import { PRODUCT_EDITOR_FIELDS, type ProductEditorDetail } from '@/contracts/mobile/biz/v1';
import {
  checkProductEditorChange,
  ProductEditorConflict,
  storeValuesInConflict,
} from '../product-editor-conflict';
import { readEditorNumber } from '../editor/controls';
import { createProductValues, fullProductChanges } from '../editor/form';
import { orderedMedia } from '../editor/media-section';
import { visualEditable } from '../editor/rich-description';
import { fieldSection, plainText } from '../editor/summaries';

const base: ProductEditorDetail = {
  id: 'product',
  version: 'v1',
  values: {
    name: 'Product',
    description: '<p>Existing HTML</p>',
    price: 20,
    category: 'home',
    stock: 10,
    variants: [
      {
        id: 'existing',
        name: 'Small',
        price: 20,
        stock: 10,
        locationInventory: [{ locationId: 'warehouse', quantity: 10 }],
        optionValues: [{ optionName: 'Size', value: 'Small' }],
      },
    ],
  },
  product: {
    id: 'product',
    name: 'Product',
    status: 'active',
    images: [],
    priceOnRequest: false,
    variants: [],
    stock: 10,
    lowStock: false,
    untracked: false,
    locations: [],
    version: 'v1',
    updatedAt: '2026-10-07T00:00:00Z',
  },
  writableFields: [...PRODUCT_EDITOR_FIELDS],
  actions: [],
  dependencies: [],
};

it('omits old inventory and unchanged fields, while retaining new-variant initial inventory', () => {
  const values = {
    ...base.values,
    stock: 99,
    variants: [
      { ...base.values.variants![0]!, price: 24 },
      {
        name: 'Large',
        price: 26,
        stock: 4,
        optionValues: [{ optionName: 'Size', value: 'Large' }],
      },
    ],
  };
  const request = fullProductChanges(base, values, base.writableFields);
  expect(request.changes).not.toHaveProperty('stock');
  expect(request.changes).not.toHaveProperty('name');
  expect(request.changes.variants?.[0]).not.toHaveProperty('stock');
  expect(request.changes.variants?.[0]).not.toHaveProperty('locationInventory');
  expect(request.changes.variants?.[1]?.stock).toBe(4);
  expect(request.stockBaseline?.variants?.existing?.stock).toBe(10);
  expect(base.values.variants?.[0]?.stock).toBe(10);
});

it('rebases variant metadata when only server inventory changed', () => {
  const request = fullProductChanges(
    base,
    { ...base.values, variants: [{ ...base.values.variants![0]!, price: 24 }] },
    base.writableFields
  );
  const current = {
    ...base,
    values: {
      ...base.values,
      variants: [
        {
          ...base.values.variants![0]!,
          stock: 8,
          locationInventory: [{ locationId: 'warehouse', quantity: 8 }],
        },
      ],
    },
  };
  expect(checkProductEditorChange(request, base, current).state).toBe('unchanged');
});

it('removes inapplicable digital fields and every field absent from the server grant', () => {
  const created = createProductValues(
    {
      ...base.values,
      shipping: { isPhysicalProduct: true },
      digitalAssets: [{ id: 'private', filename: 'private.pdf' }],
      cost: 8,
    },
    ['name', 'description', 'price', 'category', 'shipping', 'digitalAssets']
  );
  expect(created).not.toHaveProperty('digitalAssets');
  expect(created).not.toHaveProperty('cost');
});

it('opens in the visual editor only HTML it keeps whole', () => {
  expect(
    visualEditable(
      '<h2>Fit</h2><p>A <strong>bold</strong> <a href="https://example.com" target="_blank" rel="noopener">link</a>.</p><ul><li><p>One</p></li></ul><img src="/a.png" alt="A">'
    )
  ).toBe(true);
  expect(visualEditable('<table><tr><td>Size</td></tr></table>')).toBe(false);
  expect(visualEditable('<p style="text-align: center">Centred</p>')).toBe(false);
  expect(visualEditable('<p class="lead">Styled</p>')).toBe(false);
  expect(visualEditable('<h4>Too deep</h4>')).toBe(false);
});

it('reads a description as plain words for the search preview, without running anything', () => {
  const source =
    '<p>A <strong>bold</strong> &amp; <em>italic</em> word.</p><script>alert(1)</script>';
  expect(plainText(source)).toBe('A bold & italic word.');
});

it('moves media to any position and numbers them again', () => {
  const media = ['a', 'b', 'c'].map((id, position) => ({ id, type: 'image' as const, position }));
  expect(orderedMedia(media, 'c', 0).map((item) => [item.id, item.position])).toEqual([
    ['c', 0],
    ['a', 1],
    ['b', 2],
  ]);
  expect(orderedMedia(media, 'a', 5)).toBe(media);
});

it('places every contract field in a section of the editor', () => {
  for (const field of PRODUCT_EDITOR_FIELDS) expect(fieldSection(field)).toBeDefined();
});

it('reads editor numbers as the quick edit does: decimal commas and the keyboard digits', () => {
  expect(readEditorNumber('12,50', false)).toBe(12.5);
  expect(readEditorNumber('12.', false)).toBe(12);
  expect(readEditorNumber('١٢٫٥', false)).toBe(12.5);
  expect(readEditorNumber('৪২', true)).toBe(42);
  expect(readEditorNumber('3.5', true)).toBeNull();
  expect(readEditorNumber('-3', false)).toBeNull();
  expect(readEditorNumber('twelve', false)).toBeNull();
});

it('takes the store values only for the fields both changed after a conflict', () => {
  const current = {
    ...base,
    values: { ...base.values, name: 'Store name', seo: { pageTitle: 'Store title' } },
  };
  const request = {
    changes: {
      name: 'My name',
      shortDescription: 'My summary',
      seo: { pageTitle: 'My title', metaDescription: 'My description' },
    },
  };
  const values = storeValuesInConflict(
    new ProductEditorConflict(current, ['name', 'seo.pageTitle'], request)
  );
  expect(values).toMatchObject({
    name: 'Store name',
    shortDescription: 'My summary',
    seo: { pageTitle: 'Store title', metaDescription: 'My description' },
    price: 20,
  });
});
