/**
 * Products: the list (search, barcode, status, low stock, a category with
 * its branch, a brand, a collection) and what it can be narrowed by, one
 * product, its price and status (`If-Match`), its stock (keyed adjustments)
 * and what moved it. A staff member assigned to locations reaches the
 * products with stock there, and that stock only.
 */
import {
  PRODUCT_STATUSES,
  STOCK_ADJUSTMENT_REASONS,
  type ProductDetail,
  type ProductFilterOptions,
  type ProductListItem,
  type ProductStock,
  type StockLocation,
  type StockMovement,
  type StockMovementActor,
  type StockRow,
} from '@/contracts/mobile/biz/v1';

import { ACCOUNTS } from '../fixtures/accounts';
import {
  LOCATIONS,
  PRODUCT_BRANDS,
  PRODUCT_CATEGORIES,
  PRODUCT_COLLECTIONS,
  seedProducts,
  type MockProduct,
  type MockStock,
  type MockVariant,
} from '../fixtures/products';
import { flag, image, money, notFound, oneOf, pageOf, searchOf } from '../fixtures/shared';
import { seedMovements, type MockMovement } from '../fixtures/stock-movements';
import {
  MockAnswer,
  MockError,
  accountOf,
  bodyOf,
  grantOf,
  invalid,
  type MockContext,
  type MockRoute,
} from '../kit';
import {
  locationsOf,
  reaches,
  scopeOf,
  seesLocation,
  vendorNameFor,
  type MockScope,
} from '../scope';

/** At or below this many units a product counts as low on stock. */
export const LOW_STOCK_THRESHOLD = 10;

let products = seedProducts();
let movements = seedMovements();
let movementCount = 0;

export function reset(): void {
  products = seedProducts();
  movements = seedMovements();
  movementCount = 0;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

const sum = (stock: Record<string, MockStock>, field: keyof MockStock) =>
  Object.values(stock).reduce((total, row) => total + row[field], 0);

function availableOf(product: MockProduct): number {
  if (product.variants.length === 0) return sum(product.stock, 'available');
  return product.variants.reduce((total, variant) => total + sum(variant.stock, 'available'), 0);
}

function isLowStock(product: MockProduct): boolean {
  return (
    !product.untracked && product.status !== 'draft' && availableOf(product) <= LOW_STOCK_THRESHOLD
  );
}

/** The products in reach, newest first: for a staff member assigned to locations, those stocked there. */
function inScope(scope: MockScope): MockProduct[] {
  return products
    .filter(
      (product) =>
        reaches(scope, product.vendorId) &&
        (scope.kind !== 'store' ||
          !scope.locationIds ||
          locationsOf(product.vendorId).some((locationId) => seesLocation(scope, locationId)))
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** How many products in reach are low on stock: Home's tile. */
export function lowStockCount(scope: MockScope): number {
  return inScope(scope).filter(isLowStock).length;
}

function productOf(ctx: MockContext, id: string): MockProduct {
  const product = inScope(scopeOf(grantOf(ctx))).find((candidate) => candidate.id === id);
  if (!product) throw notFound('Product');
  return product;
}

/** The units at each of the owner's locations the operator may see. */
function locationsAt(
  stock: Record<string, MockStock>,
  product: MockProduct,
  scope: MockScope
): StockLocation[] {
  return locationsOf(product.vendorId)
    .filter((locationId) => seesLocation(scope, locationId))
    .map((locationId) => ({
      locationId,
      name: LOCATIONS[locationId]?.name ?? locationId,
      available: stock[locationId]?.available ?? 0,
    }));
}

function productLocations(product: MockProduct, scope: MockScope): StockLocation[] {
  if (product.variants.length === 0) return locationsAt(product.stock, product, scope);
  const together: Record<string, MockStock> = {};
  for (const variant of product.variants) {
    for (const [locationId, row] of Object.entries(variant.stock)) {
      const held = (together[locationId] ??= { available: 0, committed: 0, unavailable: 0 });
      held.available += row.available;
    }
  }
  return locationsAt(together, product, scope);
}

function listItemOf(product: MockProduct, scope: MockScope, locale: string): ProductListItem {
  const prices = product.variants.length
    ? product.variants.map((variant) => variant.price).filter((price) => price !== undefined)
    : product.price === undefined
      ? []
      : [product.price];
  const low = prices.length ? Math.min(...prices) : undefined;
  const high = prices.length ? Math.max(...prices) : undefined;
  const vendorName = vendorNameFor(scope, product.vendorId);

  return {
    id: product.id,
    name: product.name,
    ...(product.sku ? { sku: product.sku } : {}),
    status: product.status,
    ...(product.images?.[0]
      ? { image: product.images[0] }
      : product.pictures[0]
        ? { image: image(product.pictures[0], product.name) }
        : {}),
    ...(!product.priceOnRequest && low !== undefined ? { price: money(low, locale) } : {}),
    ...(!product.priceOnRequest && high !== undefined && high !== low
      ? { maxPrice: money(high, locale) }
      : {}),
    stock: availableOf(product),
    lowStock: isLowStock(product),
    untracked: product.untracked,
    variantCount: product.variants.length,
    ...(vendorName ? { vendorName } : {}),
  };
}

function variantOf(product: MockProduct, variant: MockVariant, scope: MockScope, locale: string) {
  return {
    id: variant.id,
    name: variant.name,
    ...(variant.sku ? { sku: variant.sku } : {}),
    ...(variant.barcode ? { barcode: variant.barcode } : {}),
    ...(!product.priceOnRequest && variant.price !== undefined
      ? { price: money(variant.price, locale) }
      : {}),
    ...(!product.priceOnRequest && variant.compareAtPrice !== undefined
      ? { compareAtPrice: money(variant.compareAtPrice, locale) }
      : {}),
    stock: sum(variant.stock, 'available'),
    ...(product.pictures[0] ? { image: image(product.pictures[0], variant.name) } : {}),
    locations: locationsAt(variant.stock, product, scope),
  };
}

const versionOf = (product: MockProduct) => String(product.updatedAt);

function detailOf(product: MockProduct, scope: MockScope, locale: string): ProductDetail {
  const ownPrice = product.variants.length === 0 && !product.priceOnRequest;
  const vendorName = vendorNameFor(scope, product.vendorId);
  return {
    id: product.id,
    name: product.name,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.barcode ? { barcode: product.barcode } : {}),
    status: product.status,
    images: product.images ?? product.pictures.map((seed) => image(seed, product.name)),
    ...(ownPrice && product.price !== undefined ? { price: money(product.price, locale) } : {}),
    ...(ownPrice && product.compareAtPrice !== undefined
      ? { compareAtPrice: money(product.compareAtPrice, locale) }
      : {}),
    priceOnRequest: product.priceOnRequest,
    variants: product.variants.map((variant) => variantOf(product, variant, scope, locale)),
    stock: availableOf(product),
    lowStock: isLowStock(product),
    untracked: product.untracked,
    locations: productLocations(product, scope),
    ...(vendorName ? { vendorName } : {}),
    version: versionOf(product),
    updatedAt: new Date(product.updatedAt).toISOString(),
  };
}

function stockRow(
  product: MockProduct,
  scope: MockScope,
  name: string,
  stock: Record<string, MockStock>,
  variant?: MockVariant
): StockRow {
  const available = sum(stock, 'available');
  const committed = sum(stock, 'committed');
  const unavailable = sum(stock, 'unavailable');
  const sku = variant ? variant.sku : product.sku;
  return {
    ...(variant ? { variantId: variant.id } : {}),
    name,
    ...(sku ? { sku } : {}),
    available,
    committed,
    unavailable,
    onHand: available + committed + unavailable,
    locations: locationsAt(stock, product, scope),
  };
}

function stockOf(product: MockProduct, scope: MockScope): ProductStock {
  return {
    productId: product.id,
    untracked: product.untracked,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    rows: product.untracked
      ? []
      : product.variants.length
        ? product.variants.map((variant) =>
            stockRow(product, scope, variant.name, variant.stock, variant)
          )
        : [stockRow(product, scope, product.name, product.stock)],
  };
}

/** A code as the register cleans it: no control characters, spaces or dashes, upper case, UPC-A for a 0-led EAN-13. */
function normalizeCode(code: string): string {
  const clean = code.replace(/[\u0000-\u001f\u007f\s-]/g, '').toUpperCase();
  return /^0\d{12}$/.test(clean) ? clean.slice(1) : clean;
}

function carriesCode(product: MockProduct, code: string): boolean {
  const codes = [
    product.barcode,
    product.sku,
    ...product.variants.flatMap((variant) => [variant.barcode, variant.sku]),
  ];
  return codes.some((candidate) => candidate !== undefined && normalizeCode(candidate) === code);
}

// ─── Changing ────────────────────────────────────────────────────────────────

/** Moves the version: every write to a product does, a sale and a stock count included. */
export function touch(product: MockProduct): void {
  product.updatedAt = Math.max(Date.now(), product.updatedAt + 1);
}

/** The versions `If-Match` names: a list is accepted, quotes and the weak mark ignored, `*` is none. */
function versionsAsked(header: string | null): string[] {
  return (header ?? '')
    .split(',')
    .map((part) => part.trim().replace(/^W\//, '').replace(/^"|"$/g, ''))
    .filter((part) => part && part !== '*');
}

function priceField(value: unknown, field: string, nullable: boolean): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw invalid(field, 'Send a price of 0 or more');
  }
  return value;
}

function update(ctx: MockContext, product: MockProduct): void {
  const body = bodyOf(ctx);
  const price = priceField(body.price, 'price', false);
  const compareAtPrice = priceField(body.compareAtPrice, 'compareAtPrice', true);
  const status =
    body.status === undefined
      ? undefined
      : (PRODUCT_STATUSES as readonly unknown[]).includes(body.status)
        ? (body.status as MockProduct['status'])
        : (() => {
            throw invalid('status', `Expected one of: ${PRODUCT_STATUSES.join(', ')}`);
          })();
  const variants = Array.isArray(body.variants) ? body.variants : [];

  const changesPrice = price !== undefined || compareAtPrice !== undefined || variants.length > 0;
  if (changesPrice && product.priceOnRequest) {
    throw new MockError(
      409,
      'CONFLICT',
      'This product shows no price; change that on the website',
      {
        reason: 'PRICE_ON_REQUEST',
      }
    );
  }
  if ((price !== undefined || compareAtPrice !== undefined) && product.variants.length) {
    throw new MockError(400, 'VALIDATION_ERROR', 'A product with variants is priced per variant', {
      reason: 'VARIANT_PRICES',
      errors: { price: ['Set the prices of its variants'] },
    });
  }

  const variantChanges = variants.map((entry, index) => {
    const change = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    const variant = product.variants.find((candidate) => candidate.id === change.id);
    if (!variant) {
      throw new MockError(400, 'VALIDATION_ERROR', 'No such variant on this product', {
        reason: 'UNKNOWN_VARIANT',
        errors: { [`variants.${index}.id`]: ['Unknown variant'] },
      });
    }
    return {
      variant,
      price: priceField(change.price, `variants.${index}.price`, false),
      compareAtPrice: priceField(change.compareAtPrice, `variants.${index}.compareAtPrice`, true),
    };
  });

  if (price !== undefined && price !== null) product.price = price;
  if (compareAtPrice !== undefined) product.compareAtPrice = compareAtPrice ?? undefined;
  if (status) product.status = status;
  for (const change of variantChanges) {
    if (change.price !== undefined && change.price !== null) change.variant.price = change.price;
    if (change.compareAtPrice !== undefined) {
      change.variant.compareAtPrice = change.compareAtPrice ?? undefined;
    }
  }
  touch(product);
}

function adjust(ctx: MockContext, product: MockProduct): void {
  const body = bodyOf(ctx);
  const locationId = typeof body.locationId === 'string' ? body.locationId : '';
  const delta = body.delta;
  if (!locationId) throw invalid('locationId', 'Say which location');
  if (
    typeof delta !== 'number' ||
    !Number.isInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > 100_000
  ) {
    throw invalid('delta', 'Add or remove at least one unit.');
  }
  if (!(STOCK_ADJUSTMENT_REASONS as readonly unknown[]).includes(body.reason)) {
    throw invalid('reason', `Expected one of: ${STOCK_ADJUSTMENT_REASONS.join(', ')}`);
  }
  if (product.untracked) {
    throw new MockError(409, 'CONFLICT', 'Stock is not counted for this product', {
      reason: 'UNTRACKED',
    });
  }
  if (
    !locationsOf(product.vendorId).includes(locationId) ||
    !seesLocation(scopeOf(grantOf(ctx)), locationId)
  ) {
    throw new MockError(403, 'AUTHORIZATION_ERROR', 'Not a location of yours', {
      reason: 'LOCATION_NOT_ALLOWED',
    });
  }

  let stock = product.stock;
  let variantId: string | undefined;
  if (product.variants.length) {
    if (typeof body.variantId !== 'string') {
      throw new MockError(400, 'VALIDATION_ERROR', 'Say which variant', {
        reason: 'VARIANT_REQUIRED',
        errors: { variantId: ['Required on a product with variants'] },
      });
    }
    const variant = product.variants.find((candidate) => candidate.id === body.variantId);
    if (!variant) {
      throw new MockError(400, 'VALIDATION_ERROR', 'No such variant on this product', {
        reason: 'UNKNOWN_VARIANT',
        errors: { variantId: ['Unknown variant'] },
      });
    }
    stock = variant.stock;
    variantId = variant.id;
  }

  const row = (stock[locationId] ??= { available: 0, committed: 0, unavailable: 0 });
  const before = row.available;
  // Stock never goes below zero: a −100 on 12 leaves 0.
  row.available = Math.max(0, row.available + delta);
  touch(product);

  // The store's record of it, as the Activity Log keeps one: what it moved, not what was asked.
  if (row.available !== before) {
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;
    movementCount += 1;
    movements.push({
      id: `mov_new_${movementCount}`,
      productId: product.id,
      at: new Date().toISOString(),
      kind: 'adjustment',
      change: row.available - before,
      quantityAfter: row.available,
      ...(variantId ? { variantId } : {}),
      locationId,
      reason: body.reason as MockMovement['reason'],
      ...(note ? { note } : {}),
      by: accountOf(ctx).id,
    });
  }
}

// ─── Stock history ───────────────────────────────────────────────────────────

/**
 * Who moved the units, as the operator may know them: on a seller's product,
 * somebody outside the seller's team is the store's, unnamed.
 */
function actorOf(by: string | undefined, scope: MockScope): StockMovementActor {
  const account = by ? ACCOUNTS.find((candidate) => candidate.id === by) : undefined;
  if (!account) return { kind: 'system' };
  if (
    scope.kind !== 'store' &&
    !account.grants.some((grant) => grant.vendorId === scope.vendorId)
  ) {
    return { kind: 'store' };
  }
  return {
    kind: 'person',
    name: account.name,
    ...(account.role === 'customer' ? {} : { role: account.role }),
  };
}

function movementOf(movement: MockMovement, product: MockProduct, scope: MockScope): StockMovement {
  const actor = actorOf(movement.by, scope);
  const variant = product.variants.find((candidate) => candidate.id === movement.variantId);
  const location = movement.locationId ? LOCATIONS[movement.locationId] : undefined;
  return {
    id: movement.id,
    at: movement.at,
    kind: movement.kind,
    change: movement.change,
    ...(movement.quantityAfter !== undefined ? { quantityAfter: movement.quantityAfter } : {}),
    ...(movement.variantId ? { variantId: movement.variantId } : {}),
    ...(variant ? { variantName: variant.name } : {}),
    ...(movement.locationId ? { locationId: movement.locationId } : {}),
    ...(location ? { locationName: location.name } : {}),
    ...(movement.reason ? { reason: movement.reason } : {}),
    ...(movement.set ? { set: true } : {}),
    ...(movement.note && actor.kind !== 'store' ? { note: movement.note } : {}),
    ...(movement.reference ? { reference: movement.reference } : {}),
    actor,
  };
}

/**
 * GET /products/{id}/stock-movements: newest first, one location's or one
 * variant's. A staff member assigned to locations sees those only, never a
 * movement recorded without one, and is refused another.
 */
function movementsOf(ctx: MockContext, product: MockProduct) {
  const scope = scopeOf(grantOf(ctx));
  const locationId = ctx.query.get('locationId') || undefined;
  const variantId = ctx.query.get('variantId') || undefined;
  if (locationId && !seesLocation(scope, locationId)) {
    throw new MockError(403, 'AUTHORIZATION_ERROR', 'Not a location you can see stock at', {
      reason: 'LOCATION_NOT_ALLOWED',
    });
  }
  if (variantId && !product.variants.some((variant) => variant.id === variantId)) {
    throw new MockError(400, 'VALIDATION_ERROR', 'Not a variant of this product', {
      reason: 'UNKNOWN_VARIANT',
      errors: { variantId: ['Unknown variant'] },
    });
  }
  const assigned = scope.kind === 'store' ? scope.locationIds : undefined;
  const rows = movements
    .filter(
      (movement) =>
        movement.productId === product.id &&
        (!variantId || movement.variantId === variantId) &&
        (!locationId || movement.locationId === locationId) &&
        (!assigned || (movement.locationId !== undefined && assigned.includes(movement.locationId)))
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  const page = pageOf(rows, ctx.query);
  return { ...page, items: page.items.map((movement) => movementOf(movement, product, scope)) };
}

// ─── Category, brand, collection ─────────────────────────────────────────────

/** A category and every one under it. */
function branchOf(categoryId: string): Set<string> {
  const branch = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of PRODUCT_CATEGORIES) {
      if (category.parentId && branch.has(category.parentId) && !branch.has(category.id)) {
        branch.add(category.id);
        grew = true;
      }
    }
  }
  return branch;
}

function lowestPrice(product: MockProduct): number | undefined {
  const prices = [product.price, ...product.variants.map((variant) => variant.price)].filter(
    (price): price is number => typeof price === 'number'
  );
  return prices.length ? Math.min(...prices) : undefined;
}

/** Hand-picked, or by the collection's price rule. */
function inCollection(product: MockProduct, collection: (typeof PRODUCT_COLLECTIONS)[number]) {
  if (collection.under === undefined)
    return product.collectionIds?.includes(collection.id) ?? false;
  const price = lowestPrice(product);
  return !product.priceOnRequest && price !== undefined && price < collection.under;
}

/** The list's category, brand and collection filters; an id the store does not have finds nothing. */
function narrowed(rows: MockProduct[], query: URLSearchParams): MockProduct[] {
  const categoryId = query.get('categoryId');
  const brandId = query.get('brandId');
  const collectionId = query.get('collectionId');
  if (categoryId) {
    const branch = branchOf(categoryId);
    rows = rows.filter(
      (product) => product.categoryId !== undefined && branch.has(product.categoryId)
    );
  }
  if (brandId) rows = rows.filter((product) => product.brandId === brandId);
  if (collectionId) {
    const collection = PRODUCT_COLLECTIONS.find((candidate) => candidate.id === collectionId);
    rows = collection ? rows.filter((product) => inCollection(product, collection)) : [];
  }
  return rows;
}

/** What the operator's own products can be narrowed by: their categories and those above them. */
function filtersOf(scope: MockScope): ProductFilterOptions {
  const rows = inScope(scope);
  const shown = new Set<string>();
  for (const product of rows) {
    let cursor = product.categoryId;
    while (cursor && !shown.has(cursor)) {
      shown.add(cursor);
      cursor = PRODUCT_CATEGORIES.find((category) => category.id === cursor)?.parentId;
    }
  }
  return {
    categories: PRODUCT_CATEGORIES.filter((category) => shown.has(category.id)),
    brands: PRODUCT_BRANDS.filter((brand) => rows.some((product) => product.brandId === brand.id)),
    collections: PRODUCT_COLLECTIONS.filter((collection) =>
      rows.some((product) => inCollection(product, collection))
    ).map(({ id, name }) => ({ id, name })),
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/products',
    access: { capability: 'VIEW_PRODUCTS' },
    handle: (ctx) => {
      const scope = scopeOf(grantOf(ctx));
      const status = oneOf(ctx.query, 'status', PRODUCT_STATUSES);
      let rows = inScope(scope).filter((product) => !status || product.status === status);

      const barcode = ctx.query.get('barcode')?.trim();
      if (barcode) {
        // Every product carrying the code, on one page.
        const code = normalizeCode(barcode);
        const items = rows.filter((product) => carriesCode(product, code));
        return { items: items.map((p) => listItemOf(p, scope, ctx.locale)), nextCursor: null };
      }

      const search = searchOf(ctx.query);
      if (search) {
        rows = rows.filter(
          (product) =>
            product.name.toLowerCase().includes(search) ||
            (product.sku ?? '').toLowerCase().includes(search)
        );
      }
      if (flag(ctx.query, 'lowStock')) rows = rows.filter(isLowStock);
      rows = narrowed(rows, ctx.query);

      const page = pageOf(rows, ctx.query);
      return { ...page, items: page.items.map((p) => listItemOf(p, scope, ctx.locale)) };
    },
  },
  {
    method: 'GET',
    path: '/products/filters',
    access: { capability: 'VIEW_PRODUCTS' },
    handle: (ctx) => filtersOf(scopeOf(grantOf(ctx))),
  },
  {
    method: 'GET',
    path: /^\/products\/([^/]+)\/stock$/,
    access: { capability: 'VIEW_STOCK' },
    handle: (ctx, [id = '']) => stockOf(productOf(ctx, id), scopeOf(grantOf(ctx))),
  },
  {
    method: 'GET',
    path: /^\/products\/([^/]+)\/stock-movements$/,
    access: { capability: 'VIEW_STOCK' },
    handle: (ctx, [id = '']) => movementsOf(ctx, productOf(ctx, id)),
  },
  {
    method: 'POST',
    path: /^\/products\/([^/]+)\/stock-adjustments$/,
    access: { capability: 'ADJUST_STOCK' },
    idempotent: true,
    handle: (ctx, [id = '']) => {
      const product = productOf(ctx, id);
      adjust(ctx, product);
      return stockOf(product, scopeOf(grantOf(ctx)));
    },
  },
  {
    method: 'GET',
    path: /^\/products\/([^/]+)$/,
    access: { capability: 'VIEW_PRODUCTS' },
    handle: (ctx, [id = '']) => {
      const product = productOf(ctx, id);
      return new MockAnswer(
        detailOf(product, scopeOf(grantOf(ctx)), ctx.locale),
        `"${versionOf(product)}"`
      );
    },
  },
  {
    method: 'PATCH',
    path: /^\/products\/([^/]+)$/,
    access: { capability: 'EDIT_PRODUCTS' },
    handle: (ctx, [id = '']) => {
      const product = productOf(ctx, id);
      const asked = versionsAsked(ctx.headers.get('if-match'));
      if (asked.length === 0) {
        throw new MockError(
          428,
          'PRECONDITION_REQUIRED',
          'Send If-Match with the version you changed'
        );
      }
      if (!asked.includes(versionOf(product))) {
        throw new MockError(412, 'PRECONDITION_FAILED', 'This product changed since you read it');
      }
      update(ctx, product);
      return new MockAnswer(
        detailOf(product, scopeOf(grantOf(ctx)), ctx.locale),
        `"${versionOf(product)}"`
      );
    },
  },
];

/**
 * For tests: changes a product as somebody else would (a sale, another
 * operator), so its version moves under the app.
 */
export function changeMockProduct(id: string, change: (product: MockProduct) => void): void {
  const product = products.find((candidate) => candidate.id === id);
  if (!product) throw new Error(`No mock product ${id}`);
  change(product);
  touch(product);
}

/** Full editor extension points share the same catalogue and inventory as quick edits. */
export const getMockProduct = (ctx: MockContext, id: string) => productOf(ctx, id);
export const allMockProducts = () => products;
export function putMockProduct(product: MockProduct): void {
  products = [...products.filter((current) => current.id !== product.id), product];
}
export function removeMockProduct(id: string): void {
  products = products.filter((product) => product.id !== id);
}
export const mockProductDetail = (ctx: MockContext, id: string) =>
  detailOf(productOf(ctx, id), scopeOf(grantOf(ctx)), ctx.locale);
export const touchMockProduct = touch;
