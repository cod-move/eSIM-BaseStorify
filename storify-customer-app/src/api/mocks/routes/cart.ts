/**
 * The cart. A guest's is found by its token, a signed-in shopper's by the
 * session. Like the store, the mock prices every line and refuses what cannot
 * be bought, with the contract's reason.
 */
import {
  REQUEST_HEADERS,
  type Cart,
  type CartLine,
  type CartReason,
} from '@/contracts/mobile/shop/v1';

import { ACCOUNT_CART, SAMPLE_CART, SAMPLE_CART_PARAM } from '../fixtures/cart';
import { findProduct } from '../fixtures/product';
import { money } from '../fixtures/shared';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';
import { state, type StoredLine } from '../state';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/cart', handle: (ctx) => cartView(ctx, sampleCartFor(ctx)) },
  { method: 'PUT', path: '/cart/lines', handle: setCartLine },
  {
    method: 'DELETE',
    path: /^\/cart\/lines\/(.+)$/,
    handle: (ctx, [lineKey = '']) => removeCartLine(ctx, lineKey),
  },
  { method: 'POST', path: '/cart/merge', handle: mergeCart },
];

function cartKey({ user, headers }: MockContext): string | null {
  if (user) return `user:${user.id}`;
  return headers.get(REQUEST_HEADERS.cartToken);
}

/**
 * A new guest on a web page opened with `?mock-cart=sample` starts with the
 * sample cart (fixtures/cart.ts), so the filled cart can be looked at without
 * shopping first. Everywhere else a new guest's cart is empty, as at the store.
 */
function sampleCartFor(ctx: MockContext): string | undefined {
  const page = (globalThis as { location?: { search?: string } }).location;
  if (cartKey(ctx) || !page?.search?.includes(SAMPLE_CART_PARAM)) return undefined;
  const token = `mock-cart-${state.nextId++}`;
  state.carts.set(
    token,
    SAMPLE_CART.map((line) => ({ ...line }))
  );
  return token;
}

/** Why the store would not check a line out as it stands, as the store says it. */
function reasonFor(
  product: { purchasableInApp: boolean; requiresVariantChoice: boolean },
  hasVariant: boolean,
  quantity: number,
  maxQuantity: number
): CartReason | undefined {
  if (!product.purchasableInApp) return 'NOT_PURCHASABLE_IN_APP';
  if (product.requiresVariantChoice && !hasVariant) return 'VARIANT_REQUIRED';
  if (maxQuantity === 0) return 'OUT_OF_STOCK';
  if (quantity > maxQuantity) return 'QUANTITY_LIMITED';
  return undefined;
}

/** A signed-in shopper finds a cart that holds something the first time it is opened, as one who shopped before. */
function seedAccountCart({ user }: MockContext) {
  if (!user) return;
  const key = `user:${user.id}`;
  if (state.seededCarts.has(key)) return;
  state.seededCarts.add(key);
  if (!state.carts.has(key))
    state.carts.set(
      key,
      ACCOUNT_CART.map((line) => ({ ...line }))
    );
}

function cartView(ctx: MockContext, createdToken?: string): Cart {
  seedAccountCart(ctx);
  const key = createdToken ?? cartKey(ctx);
  const stored = key ? (state.carts.get(key) ?? []) : [];

  const lines = stored.flatMap((line): CartLine[] => {
    const product = findProduct(line.productId.replace(/^prod_/, ''), ctx.locale);
    if (!product) return [];
    const variant = product.variants.find((candidate) => candidate.id === line.variantId);
    const unit = variant?.price ?? product.price ?? money(0, ctx.locale);
    const labels = (variant?.optionValueIds ?? []).map(
      (id) =>
        product.options.flatMap((option) => option.values).find((value) => value.id === id)?.label
    );
    const maxQuantity = variant?.maxQuantity ?? product.maxQuantity;

    return [
      {
        key: line.variantId ?? line.productId,
        productId: line.productId,
        variantId: line.variantId,
        slug: product.slug,
        name: product.name,
        variantLabel: labels.length > 0 ? labels.join(' / ') : undefined,
        image: product.image,
        quantity: line.quantity,
        maxQuantity,
        unitPrice: unit,
        compareAtUnitPrice: product.compareAtPrice,
        lineTotal: money(unit.amount * line.quantity, ctx.locale),
        availability: variant?.availability ?? product.availability,
        vendor: product.vendor,
        reason: reasonFor(product, variant !== undefined, line.quantity, maxQuantity),
      },
    ];
  });

  return {
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotal: money(
      lines.reduce((total, line) => total + line.lineTotal.amount, 0),
      ctx.locale
    ),
    cartToken: createdToken,
  };
}

function setCartLine(ctx: MockContext): Cart {
  const { productId, variantId, quantity } = ctx.body as StoredLine;
  const product = findProduct(String(productId).replace(/^prod_/, ''), ctx.locale);
  if (!product) throw new MockError(404, 'NOT_FOUND', 'Product not found');
  if (!product.purchasableInApp) {
    throw new MockError(409, 'CONFLICT', 'Not sold in the app', 'NOT_PURCHASABLE_IN_APP');
  }

  const variant = product.variants.find((candidate) => candidate.id === variantId);
  if (product.requiresVariantChoice && !variant) {
    throw new MockError(409, 'CONFLICT', 'Choose an option first', 'VARIANT_REQUIRED');
  }

  const maxQuantity = variant?.maxQuantity ?? product.maxQuantity;
  if (maxQuantity === 0) throw new MockError(409, 'CONFLICT', 'Out of stock', 'OUT_OF_STOCK');
  if (quantity > maxQuantity) {
    throw new MockError(409, 'CONFLICT', `Only ${maxQuantity} available`, 'QUANTITY_LIMITED');
  }

  // A guest's first line creates the cart, and the token that finds it again.
  let key = cartKey(ctx);
  let createdToken: string | undefined;
  if (!key) {
    createdToken = `mock-cart-${state.nextId++}`;
    key = createdToken;
  }

  const lines = state.carts.get(key) ?? [];
  const existing = lines.find(
    (line) => line.productId === productId && line.variantId === variantId
  );
  if (existing) existing.quantity = quantity;
  else lines.push({ productId, variantId, quantity });
  state.carts.set(key, lines);

  return cartView(ctx, createdToken);
}

function removeCartLine(ctx: MockContext, lineKey: string): Cart {
  const key = cartKey(ctx);
  if (key) {
    const remaining = (state.carts.get(key) ?? []).filter(
      (line) => (line.variantId ?? line.productId) !== lineKey
    );
    state.carts.set(key, remaining);
  }
  return cartView(ctx);
}

function mergeCart(ctx: MockContext): Cart {
  const user = requireUser(ctx);
  const token = ctx.headers.get(REQUEST_HEADERS.cartToken);
  const guestLines = token ? (state.carts.get(token) ?? []) : [];
  const ownKey = `user:${user.id}`;
  const own = state.carts.get(ownKey) ?? [];

  for (const line of guestLines) {
    const existing = own.find(
      (candidate) =>
        candidate.productId === line.productId && candidate.variantId === line.variantId
    );
    if (existing) existing.quantity = Math.max(existing.quantity, line.quantity);
    else own.push(line);
  }
  state.carts.set(ownKey, own);
  if (token) state.carts.delete(token);

  return cartView(ctx);
}
