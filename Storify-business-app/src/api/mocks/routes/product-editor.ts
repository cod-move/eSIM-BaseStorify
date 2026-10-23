import {
  ProductCreateRequest,
  ProductEditorActionRequest,
  ProductEditorDetail,
  ProductEditorFields,
  ProductSaveRequest,
  ProductVariantGenerateRequest,
  ProductVariantGeneration,
  type OperationStatus,
  type ProductFormOptions,
  type ProductVariantWriteRequest,
} from '@/contracts/mobile/biz/v1';

import { PRODUCT_EDITOR_OPTIONS } from '../fixtures/product-editor';
import { LOCATIONS, type MockProduct, type MockStock } from '../fixtures/products';
import {
  grantOf,
  invalid,
  MockError,
  requireCapability,
  type MockContext,
  type MockRoute,
} from '../kit';
import { locationsOf } from '../scope';
import { state } from '../state';
import { keepMockOperation } from './operations';
import {
  allMockProducts,
  getMockProduct,
  mockProductDetail,
  putMockProduct,
  removeMockProduct,
  touchMockProduct,
} from './products';
import {
  registerMockUploadTarget,
  removeMockUploadTarget,
  editorMockUpload,
  claimMockProductUpload,
} from './uploads';

const values = new Map<string, ProductEditorFields>();
const deleted = new Map<string, string | undefined>();
export function reset() {
  values.clear();
  deleted.clear();
}

function optionsOf(ctx: MockContext, product?: MockProduct): ProductFormOptions {
  const options = structuredClone(PRODUCT_EDITOR_OPTIONS);
  const owner = product?.vendorId ?? grantOf(ctx).vendorId;
  options.locations = locationsOf(owner).map((id, index) => ({
    id,
    name: LOCATIONS[id]?.name ?? id,
    isDefault: index === 0,
  }));
  if (!grantOf(ctx).capabilities.includes('DELETE_PRODUCTS'))
    options.actions = options.actions.filter((action) => action !== 'delete');
  if (!grantOf(ctx).capabilities.includes('EDIT_PRODUCTS') && product) {
    options.writableFields = [];
    options.actions = [];
  }
  return options;
}

function detail(ctx: MockContext, id: string): ProductEditorDetail {
  const product = getMockProduct(ctx, id);
  const read = mockProductDetail(ctx, id);
  const saved = values.get(id);
  const initial: ProductEditorFields = {
    name: product.name,
    description: `<p>${product.name}</p>`,
    price: product.price ?? 0,
    category: product.untracked ? 'category_digital' : 'category_home',
    shipping: { isPhysicalProduct: !product.untracked },
    inventory: { tracked: !product.untracked, continueSellingWhenOutOfStock: false },
    media: read.images.map((image, position) => ({
      id: `media-${id}-${position}`,
      type: 'image',
      url: image.full,
      alt: image.alt,
      position,
    })),
  };
  const form: ProductEditorFields = {
    ...initial,
    ...saved,
    name: product.name,
    price: product.price ?? saved?.price ?? 0,
    comparePrice: product.compareAtPrice ?? null,
    priceOnRequest: product.priceOnRequest,
    sku: product.sku,
    barcode: product.barcode,
    status: product.status,
    stock: read.stock,
    locationInventory: read.locations.map((location) => ({
      locationId: location.locationId,
      quantity: location.available,
    })),
    variants: product.variants.map((variant) => ({
      ...(saved?.variants?.find((item) => item.id === variant.id) ?? { optionValues: [] }),
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      price: variant.price ?? 0,
      comparePrice: variant.compareAtPrice ?? null,
      stock: Object.values(variant.stock).reduce((total, row) => total + row.available, 0),
      locationInventory: Object.entries(variant.stock).map(([locationId, row]) => ({
        locationId,
        quantity: row.available,
      })),
    })),
  };
  const options = optionsOf(ctx, product);
  return ProductEditorDetail.parse({
    id,
    version: read.version,
    values: form,
    product: read,
    writableFields: options.writableFields,
    actions: options.actions,
    pricing: { price: read.price },
    dependencies: [],
  });
}

function authorize(ctx: MockContext, id: string, capability: 'EDIT_PRODUCTS' | 'DELETE_PRODUCTS') {
  requireCapability(ctx, capability);
  if (deleted.has(id)) {
    const vendorId = deleted.get(id);
    const grant = grantOf(ctx);
    if (grant.vendorId && grant.vendorId !== vendorId)
      throw new MockError(404, 'NOT_FOUND', 'Product not found');
  } else getMockProduct(ctx, id);
}

function operation(
  ctx: MockContext,
  id: string,
  routeId: string,
  capability: 'CREATE_PRODUCTS' | 'EDIT_PRODUCTS' | 'DELETE_PRODUCTS',
  status: OperationStatus['state'] = 'succeeded'
): OperationStatus {
  const key = ctx.headers.get('idempotency-key') ?? '';
  const result: OperationStatus = {
    key,
    state: status,
    routeId,
    resources: [{ kind: 'product', id }],
    updatedAt: new Date().toISOString(),
  };
  keepMockOperation(ctx, result, (current) => {
    if (capability === 'CREATE_PRODUCTS') {
      requireCapability(current, capability);
      getMockProduct(current, id);
    } else authorize(current, id, capability);
  });
  return result;
}

function version(ctx: MockContext, id: string, routeId: string) {
  const current = detail(ctx, id);
  const asked = ctx.headers.get('if-match')?.replace(/^"|"$/g, '');
  if (!asked) throw new MockError(428, 'PRECONDITION_REQUIRED', 'Send the product version');
  if (asked !== current.version) {
    const failed = operation(ctx, id, routeId, 'EDIT_PRODUCTS', 'failed');
    throw new MockError(412, 'PRECONDITION_FAILED', 'Product changed', {
      reason: 'PRODUCT_CHANGED',
      details: { product: current, operation: failed },
    });
  }
  return current;
}

function stockOf(
  rows: ProductEditorFields['locationInventory'],
  stock: number | undefined,
  owner: string | undefined
): Record<string, MockStock> {
  const allowed = locationsOf(owner);
  if (
    rows?.some((row) => !allowed.includes(row.locationId)) ||
    new Set(rows?.map((row) => row.locationId)).size !== (rows?.length ?? 0)
  )
    throw invalid('locationInventory', 'Choose an authorized location once');
  return Object.fromEntries(
    (rows?.length
      ? rows
      : stock !== undefined && allowed[0]
        ? [{ locationId: allowed[0], quantity: stock }]
        : []
    ).map((row) => [row.locationId, { available: row.quantity, committed: 0, unavailable: 0 }])
  );
}

function apply(
  ctx: MockContext,
  product: MockProduct,
  changes: Partial<ProductEditorFields>,
  creating = false
) {
  const current = creating ? undefined : detail(ctx, product.id).values;
  const form = ProductEditorFields.parse({ ...current, ...changes });
  if (!creating && current?.shipping?.isPhysicalProduct !== form.shipping?.isPhysicalProduct)
    throw invalid('shipping', 'Product format cannot change', 'PRODUCT_FORMAT_IMMUTABLE');
  const options = optionsOf(ctx, creating ? undefined : product);
  if (
    Object.keys(changes).some(
      (key) => !options.writableFields.includes(key as keyof ProductEditorFields)
    )
  )
    throw invalid('changes', 'Field is not allowed', 'PRODUCT_FIELD_NOT_ALLOWED');
  if (!options.categories.some((item) => item.id === form.category))
    throw invalid('category', 'Choose an available category');
  if (
    (form.variants?.length ?? 0) > options.limits.variants ||
    (form.media?.length ?? 0) > options.limits.media ||
    (form.digitalAssets?.length ?? 0) > options.limits.digitalAssets
  )
    throw invalid('values', 'Product limit reached', 'PRODUCT_LIMIT_REACHED');
  const allCodes = [
    form.barcode,
    ...(form.variants ?? []).map((variant) => variant.barcode),
  ].filter(Boolean);
  if (
    new Set(allCodes).size !== allCodes.length ||
    allMockProducts().some(
      (item) =>
        item.id !== product.id &&
        [item.barcode, ...item.variants.map((variant) => variant.barcode)].some(
          (code) => code && allCodes.includes(code)
        )
    )
  )
    throw invalid('barcode', 'Barcode already used', 'BARCODE_ALREADY_USED');
  const target = creating
    ? { kind: 'product_draft' as const, id: String((ctx.body as { draftId: string }).draftId) }
    : { kind: 'product' as const, id: product.id };
  const claim = (
    uploadId: string,
    purpose: 'product_media' | 'digital_asset' | 'digital_preview'
  ) => editorMockUpload(ctx, uploadId, target, purpose);
  form.media = form.media?.map((item) =>
    item.uploadId ? { ...item, url: claim(item.uploadId, 'product_media').url } : item
  );
  for (const item of form.digitalAssets ?? [])
    if (item.uploadId) claim(item.uploadId, 'digital_asset');
  if (form.digitalPreview?.uploadId) claim(form.digitalPreview.uploadId, 'digital_preview');
  const original = new Map(product.variants.map((variant) => [variant.id, variant]));
  product.name = form.name;
  product.price = form.price;
  product.compareAtPrice = form.comparePrice ?? undefined;
  product.sku = form.sku;
  product.barcode = form.barcode;
  product.status = form.status ?? product.status;
  product.priceOnRequest = form.priceOnRequest ?? false;
  product.untracked =
    form.shipping?.isPhysicalProduct === false || form.inventory?.tracked === false;
  if (changes.media)
    product.images = changes.media
      .filter((item) => item.type === 'image' && (item.url || item.uploadId))
      .map((item) => {
        const url = item.uploadId
          ? (claim(item.uploadId, 'product_media').url ?? '')
          : (item.url ?? '');
        return { thumb: url, card: url, full: url, alt: item.alt ?? '' };
      });
  if (creating || changes.stock !== undefined || changes.locationInventory !== undefined)
    product.stock = stockOf(form.locationInventory, form.stock, product.vendorId);
  if (changes.variants)
    product.variants =
      form.variants?.map((variant) => {
        const old = variant.id ? original.get(variant.id) : undefined;
        const id = old?.id ?? variant.id ?? `variant-${state.nextId++}`;
        return {
          id,
          name: variant.name,
          sku: variant.sku,
          barcode: variant.barcode,
          price: variant.price,
          compareAtPrice: variant.comparePrice ?? undefined,
          stock:
            old && variant.stock === undefined && variant.locationInventory === undefined
              ? old.stock
              : stockOf(variant.locationInventory, variant.stock, product.vendorId),
        };
      }) ?? [];
  form.variants = form.variants?.map((variant, index) => ({
    ...variant,
    id: product.variants[index]?.id,
  }));
  values.set(product.id, form);
  touchMockProduct(product);
  if (creating) {
    registerMockUploadTarget({
      target: { kind: 'product', id: product.id },
      vendorIds: [product.vendorId],
    });
    for (const uploadId of [
      ...(form.media ?? []).map((item) => item.uploadId),
      ...(form.digitalAssets ?? []).map((item) => item.uploadId),
      form.digitalPreview?.uploadId,
    ].filter((id): id is string => Boolean(id)))
      claimMockProductUpload(uploadId, product.id);
  }
}

export const routes: readonly MockRoute[] = [
  {
    method: 'GET',
    path: '/products/form-options',
    access: { capability: 'VIEW_PRODUCTS' },
    handle: (ctx) => {
      const id = ctx.query.get('productId');
      if (!id) requireCapability(ctx, 'CREATE_PRODUCTS');
      return optionsOf(ctx, id ? getMockProduct(ctx, id) : undefined);
    },
  },
  {
    method: 'GET',
    path: /^\/products\/([^/]+)\/editor$/,
    access: { capability: 'VIEW_PRODUCTS' },
    handle: (ctx, [id = '']) => detail(ctx, id),
  },
  {
    method: 'POST',
    path: '/products',
    access: { capability: 'CREATE_PRODUCTS' },
    idempotent: true,
    authorize: (ctx) => requireCapability(ctx, 'CREATE_PRODUCTS'),
    handle: (ctx) => {
      const input = ProductCreateRequest.safeParse(ctx.body);
      if (!input.success) throw invalid('values', 'Check the product fields');
      const id = `product-${state.nextId++}`;
      const product: MockProduct = {
        id,
        name: input.data.values.name,
        status: 'draft',
        vendorId: grantOf(ctx).vendorId,
        pictures: [],
        priceOnRequest: false,
        untracked: false,
        stock: {},
        variants: [],
        createdAt: new Date().toISOString(),
        updatedAt: Date.now(),
      };
      apply(ctx, product, input.data.values, true);
      putMockProduct(product);
      return {
        operation: operation(ctx, id, 'products.create', 'CREATE_PRODUCTS'),
        product: detail(ctx, id),
      };
    },
  },
  {
    method: 'PATCH',
    path: /^\/products\/([^/]+)\/editor$/,
    access: { capability: 'EDIT_PRODUCTS' },
    idempotent: true,
    authorize: (ctx) => authorize(ctx, ctx.path.split('/')[2] ?? '', 'EDIT_PRODUCTS'),
    handle: (ctx, [id = '']) => {
      version(ctx, id, 'products.save');
      const input = ProductSaveRequest.safeParse(ctx.body);
      if (!input.success) throw invalid('changes', 'Check the product fields');
      const product = structuredClone(getMockProduct(ctx, id));
      apply(ctx, product, input.data.changes);
      putMockProduct(product);
      return {
        operation: operation(ctx, id, 'products.save', 'EDIT_PRODUCTS'),
        product: detail(ctx, id),
      };
    },
  },
  {
    method: 'POST',
    path: /^\/products\/([^/]+)\/actions$/,
    access: { capability: 'EDIT_PRODUCTS' },
    idempotent: true,
    authorize: (ctx) =>
      authorize(
        ctx,
        ctx.path.split('/')[2] ?? '',
        (ctx.body as { action?: string })?.action === 'delete' ? 'DELETE_PRODUCTS' : 'EDIT_PRODUCTS'
      ),
    handle: (ctx, [id = '']) => {
      const current = version(ctx, id, 'products.action');
      const parsed = ProductEditorActionRequest.safeParse(ctx.body);
      if (!parsed.success || !current.actions.includes(parsed.data.action))
        throw invalid('action', 'Action unavailable');
      const action = parsed.data.action;
      const product = getMockProduct(ctx, id);
      if (action === 'delete') {
        deleted.set(id, product.vendorId);
        removeMockProduct(id);
        values.delete(id);
        removeMockUploadTarget({ kind: 'product', id });
        return {
          operation: operation(ctx, id, 'products.action', 'DELETE_PRODUCTS'),
          deleted: true,
        };
      }
      product.status =
        action === 'set_active' ? 'active' : action === 'set_draft' ? 'draft' : 'unlisted';
      touchMockProduct(product);
      return {
        operation: operation(ctx, id, 'products.action', 'EDIT_PRODUCTS'),
        product: detail(ctx, id),
      };
    },
  },
  {
    method: 'POST',
    path: '/products/variants/generate',
    access: { capability: 'EDIT_PRODUCTS' },
    handle: (ctx) => {
      const parsed = ProductVariantGenerateRequest.safeParse(ctx.body);
      if (!parsed.success) throw invalid('options', 'Check the options');
      let combinations: ProductVariantWriteRequest['optionValues'][] = parsed.data.options.length
        ? [[]]
        : [];
      for (const option of parsed.data.options) {
        if (combinations.length * option.values.length > 250)
          throw invalid('options', 'Variant limit reached');
        combinations = combinations.flatMap((combination) =>
          option.values.map((value) => [
            ...combination,
            {
              optionId: option.id,
              optionName: option.name,
              valueId: value.id,
              value: value.value,
              colorCode: value.colorCode,
            },
          ])
        );
      }
      const signature = (row: ProductVariantWriteRequest['optionValues']) =>
        row
          .map((item) => `${item.optionName}:${item.value}`)
          .sort()
          .join('|');
      const old = new Map(
        parsed.data.existing?.map((item) => [signature(item.optionValues), item])
      );
      const variants = combinations.map(
        (optionValues) =>
          old.get(signature(optionValues)) ?? {
            name: optionValues.map((item) => item.value).join(' / '),
            price: 0,
            stock: 0,
            optionValues,
          }
      );
      return ProductVariantGeneration.parse({
        variants,
        warnings: parsed.data.existing?.some(
          (item) =>
            !variants.some(
              (variant) => signature(variant.optionValues) === signature(item.optionValues)
            )
        )
          ? ['PRODUCT_HAS_DEPENDENCIES']
          : [],
      });
    },
  },
  {
    method: 'GET',
    path: /^\/products\/([^/]+)\/digital-assets\/([^/]+)$/,
    access: { capability: 'VIEW_PRODUCTS' },
    handle: (ctx, [id = '', assetId = '']) => {
      const product = detail(ctx, id);
      const asset = product.values.digitalAssets?.find((item) => item.id === assetId);
      if (!asset) throw new MockError(404, 'NOT_FOUND', 'Asset not found');
      return {
        url: `https://mock.storify.invalid/private/${encodeURIComponent(assetId)}?access=mock-${state.nextId++}`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      };
    },
  },
];
