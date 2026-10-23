/**
 * Checkout: the quote and what placing an order refuses. Like the store, the
 * mock prices the cart from the form as it stands, says what placing would
 * refuse in `fieldErrors`, and sends `quoteHash` once delivery is priced. An
 * order note holding a `MOCK_NOTE` asks for a refusal or a PRICES_CHANGED on
 * demand.
 */
import {
  REQUEST_HEADERS,
  type CheckoutQuote,
  type CheckoutQuoteLine,
  type CheckoutQuoteRequest,
  type CheckoutSellerShipping,
  type CheckoutShipping,
  type PlacedOrder,
  type PlaceOrderRequest,
} from '@/contracts/mobile/shop/v1';

import { SAMPLE_CART, SAMPLE_CART_PARAM } from '../fixtures/cart';
import { CHECKOUT_FORM, MOCK_NOTE, SHIPPING_OPTIONS, TAX_RATE } from '../fixtures/checkout';
import { listOrders } from '../fixtures/orders';
import { findProduct } from '../fixtures/product';
import { money } from '../fixtures/shared';
import { MockError, type MockContext, type MockRoute } from '../kit';
import { state } from '../state';

export const routes: MockRoute[] = [
  {
    method: 'POST',
    path: '/checkout/quote',
    handle: (ctx) => quoteFor(ctx, ctx.body as CheckoutQuoteRequest),
  },
];

/** The carts whose prices went up after a PRICES_CHANGED: their live price is 10% more. */
const raised = new Set<string>();

export function reset() {
  raised.clear();
}

const round = (amount: number) => Math.round(amount * 100) / 100;

function cartKey({ user, headers }: MockContext): string | null {
  if (user) return `user:${user.id}`;
  return headers.get(REQUEST_HEADERS.cartToken);
}

type PricedLine = CheckoutQuoteLine & { vendor?: { slug: string; name: string } };

function linesOf(ctx: MockContext): PricedLine[] {
  const key = cartKey(ctx);
  const kept = key ? (state.carts.get(key) ?? []) : [];
  // A web page opened with `?mock-cart=sample` checks the sample cart out when
  // the shopper's own is empty, so checkout can be looked at signed in.
  const page = (globalThis as { location?: { search?: string } }).location;
  const sample = kept.length === 0 && Boolean(page?.search?.includes(SAMPLE_CART_PARAM));
  const stored = sample ? SAMPLE_CART : kept;
  const up = key !== null && raised.has(key);

  return stored.flatMap((line): PricedLine[] => {
    const product = findProduct(line.productId.replace(/^prod_/, ''), ctx.locale);
    if (!product) return [];
    const variant = product.variants.find((candidate) => candidate.id === line.variantId);
    const held = variant?.price ?? product.price ?? money(0, ctx.locale);
    const unit = up ? money(round(held.amount * 1.1), ctx.locale) : held;
    return [
      {
        key: line.variantId ?? line.productId,
        productId: line.productId,
        slug: product.slug,
        variantId: line.variantId,
        name: product.name,
        image: product.image,
        quantity: line.quantity,
        unitPrice: unit,
        lineTotal: money(round(unit.amount * line.quantity), ctx.locale),
        previousUnitPrice: up ? held : undefined,
        vendor: product.vendor,
      },
    ];
  });
}

function optionsFor(locale: string) {
  return SHIPPING_OPTIONS.map(({ amount, ...option }) => ({
    ...option,
    price: money(amount, locale),
  }));
}

function shippingFor(
  ctx: MockContext,
  req: CheckoutQuoteRequest,
  lines: PricedLine[]
): CheckoutShipping {
  const address = req.shippingAddress;
  const options = optionsFor(ctx.locale);
  const priced = Boolean(address?.street && address.city && address.country);
  const vendors = new Map<string, string>();
  for (const line of lines) if (line.vendor) vendors.set(line.vendor.slug, line.vendor.name);

  if (!priced) return { status: 'NEEDS_ADDRESS', options: [], sellers: [] };
  if (vendors.size === 0) {
    const chosen = options.find((o) => o.id === req.selectedShippingOptionId) ?? options[0];
    return { status: 'READY', options, selectedOptionId: chosen?.id, sellers: [] };
  }
  const sellers = [...vendors].map(([vendorId, name]): CheckoutSellerShipping => {
    const chosen =
      options.find((o) => o.id === req.vendorShippingSelections?.[vendorId]) ?? options[0]!;
    return { vendorId, name, options, selectedOptionId: chosen.id, price: chosen.price };
  });
  return { status: 'READY', options: [], sellers };
}

function fieldErrorsFor(ctx: MockContext, req: CheckoutQuoteRequest) {
  const errors: Record<string, string[]> = {};
  const address = req.shippingAddress;
  for (const field of ['street', 'city', 'country'] as const) {
    if (!address?.[field]) errors[`shippingAddress.${field}`] = ['Required'];
  }
  if (address && !address.fullName && !(address.firstName && address.lastName)) {
    errors['shippingAddress.fullName'] = ['Enter the name to deliver to'];
  }
  if (!ctx.user && !req.email) errors.email = ['Enter an email address'];
  if (!ctx.user && !CHECKOUT_FORM.guestCheckout) errors.account = ['Sign in to order'];
  return errors;
}

function quoteFor(ctx: MockContext, req: CheckoutQuoteRequest): CheckoutQuote {
  const { locale } = ctx;
  const lines = linesOf(ctx);
  const shipping = shippingFor(ctx, req, lines);
  const subtotal = round(lines.reduce((sum, line) => sum + line.lineTotal.amount, 0));

  const code = req.couponCode?.trim().toUpperCase();
  const applies = code === 'SAVE10';
  const discount = applies ? round(subtotal * 0.1) : 0;
  const ships =
    shipping.status !== 'READY'
      ? undefined
      : shipping.sellers.length > 0
        ? round(shipping.sellers.reduce((sum, seller) => sum + seller.price.amount, 0))
        : (shipping.options.find((o) => o.id === shipping.selectedOptionId)?.price.amount ?? 0);
  const tax = round((subtotal - discount) * TAX_RATE);
  const total = round(subtotal - discount + (ships ?? 0) + tax);
  const ready = shipping.status === 'READY' && lines.length > 0;

  return {
    currency: money(0, locale).currency,
    lines: lines.map(({ vendor: _vendor, ...line }) => line),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    shipping,
    coupon: code
      ? applies
        ? { code, status: 'APPLIED', discount: money(discount, locale) }
        : { code, status: 'INVALID', message: 'This coupon does not apply' }
      : undefined,
    totals: {
      subtotal: money(subtotal, locale),
      discount: money(discount, locale),
      shipping: ships === undefined ? undefined : money(ships, locale),
      tax: money(tax, locale),
      total: money(total, locale),
      dueNow: money(total, locale),
    },
    paymentMethods: [
      { id: 'cod', flow: 'cod', name: 'Cash on delivery', available: true },
      { id: 'card', flow: 'card', name: 'Credit or debit card', available: true },
    ],
    captcha: { required: false },
    paymentsPaused: false,
    form: CHECKOUT_FORM,
    fieldErrors: fieldErrorsFor(ctx, req),
    quoteHash: ready ? `mock-${total}-${lines.length}` : undefined,
  };
}

/**
 * What the store refuses before it places an order, in the order it checks:
 * a guest where guest checkout is off (SIGN_IN_REQUIRED), a guest without an
 * email, a gift message asking to be refused, a note asking for PAYMENTS_PAUSED, a note asking for PRICES_CHANGED (once per
 * cart. PRICES_CHANGED carries the
 * live quote in `details`, as the contract says. Returns the quote the order is
 * placed from. `POST /checkout/orders` itself is in `payments.ts`, which owns
 * the idempotency of placing.
 */
export function guardOrder(ctx: MockContext, request: PlaceOrderRequest): CheckoutQuote {
  const { quoteHash: _hash, turnstileToken: _token, ...req } = request;
  const note = req.customerNote ?? '';
  const key = cartKey(ctx);
  if (!ctx.user && !CHECKOUT_FORM.guestCheckout) {
    throw new MockError(401, 'AUTHENTICATION_ERROR', 'Sign in to order', 'SIGN_IN_REQUIRED');
  }
  if (!ctx.user && !req.email) refuseField('email', 'Enter an email address');
  const gift = req.customFields?.cf_gift;
  if (typeof gift === 'string' && gift.includes(MOCK_NOTE.refuseField)) {
    refuseField('customFields.cf_gift', 'This gift message cannot be printed');
  }
  if (note.includes(MOCK_NOTE.refuse)) {
    throw new MockError(409, 'CONFLICT', 'Payments are paused', 'PAYMENTS_PAUSED');
  }
  const pricesChanged = () =>
    new MockError(409, 'CONFLICT', 'Prices changed', 'PRICES_CHANGED', undefined, {
      quote: quoteFor(ctx, req),
    });
  if (note.includes(MOCK_NOTE.pricesChanged) && key && !raised.has(key)) {
    raised.add(key);
    throw pricesChanged();
  }
  return quoteFor(ctx, req);
}

function refuseField(field: string, message: string): never {
  throw new MockError(400, 'VALIDATION_ERROR', 'Some fields need attention', undefined, {
    [field]: [message],
  });
}

/** The new order joins the shopper's history, newest first, as the store's would. */
export function recordOrder(
  quote: CheckoutQuote,
  request: PlaceOrderRequest,
  placed: Pick<PlacedOrder, 'orderId' | 'orderNumber'>
) {
  listOrders().unshift({
    id: placed.orderId,
    number: placed.orderNumber,
    status: 'pending',
    placedAt: new Date().toISOString(),
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    lines: quote.lines.map((line) => ({
      slug: line.productId.replace(/^prod_/, ''),
      quantity: line.quantity,
    })),
    note: request.customerNote,
  });
}
