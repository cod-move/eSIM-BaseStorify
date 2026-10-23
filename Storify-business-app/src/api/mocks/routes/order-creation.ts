import {
  ManualOrderCreateRequest,
  ManualOrderDraftRequest,
  ManualOrderQuote,
  OrderContactCreateRequest,
  OrderCustomerSelectorQuery,
  OrderProductSelectorQuery,
  type ManualOrderFormOptions,
  type OrderProductSelector,
  type OrderCustomerSelector,
  type OperationStatus,
} from '@/contracts/mobile/biz/v1';
import { ORDER_CUSTOMERS } from '../fixtures/order-creation';
import { LOCATIONS, type MockProduct, type MockStock } from '../fixtures/products';
import type { MockOrder } from '../fixtures/orders';
import { image, money, pageOf } from '../fixtures/shared';
import {
  accountOf,
  grantOf,
  invalid,
  MockError,
  requireCapability,
  type MockContext,
  type MockRoute,
} from '../kit';
import { locationsOf, reaches, scopeOf } from '../scope';
import { state } from '../state';
import { allMockProducts, getMockProduct, touchMockProduct } from './products';
import { mockOrderDetail, putMockOrder } from './orders';
import { keepMockOperation } from './operations';

let customers = structuredClone(ORDER_CUSTOMERS);
const customerOwners = new Map<string, string | undefined>();
type QuoteRecord = {
  actor: string;
  workspace: string;
  draft: ManualOrderDraftRequest;
  signature: string;
  quote: ManualOrderQuote;
  /** The creation (its `Idempotency-Key`) the quote was used for, whatever came of it. */
  claimedBy?: string;
};
const quotes = new Map<string, QuoteRecord>();
/** The creation each draft made, by actor, workspace and `draftId`: a draft makes one order. */
const draftOrders = new Map<string, OperationStatus>();
export function reset() {
  customers = structuredClone(ORDER_CUSTOMERS);
  customerOwners.clear();
  quotes.clear();
  draftOrders.clear();
}
export const allMockOrderContacts = () => customers;
export function expireMockManualQuotes() {
  for (const record of quotes.values()) record.quote.expiresAt = new Date(0).toISOString();
}
function canCreate(ctx: MockContext) {
  requireCapability(ctx, 'CREATE_ORDERS');
  if (grantOf(ctx).workspace === 'vendor' && grantOf(ctx).role === 'staff')
    throw new MockError(403, 'AUTHORIZATION_ERROR', 'Vendor staff cannot create orders');
}
function refusal(reason: string, status = 409): never {
  throw new MockError(status, status === 403 ? 'AUTHORIZATION_ERROR' : 'CONFLICT', '', { reason });
}
function options(ctx: MockContext): ManualOrderFormOptions {
  canCreate(ctx);
  const grant = grantOf(ctx);
  const locations = (grant.vendorId ? locationsOf(grant.vendorId) : Object.keys(LOCATIONS)).map(
    (id, index) => ({ id, name: LOCATIONS[id]!.name, isDefault: index === 0 })
  );
  const custody = grant.workspace === 'platform' ? 'platform' : 'vendor';
  return {
    currency: 'USD',
    countries: [
      { code: 'BD', name: 'Bangladesh' },
      { code: 'US', name: 'United States' },
    ],
    locations,
    delivery: [
      { id: 'shipping', kind: 'shipping', label: 'Delivery', addressRequired: true },
      ...locations.map((location) => ({
        id: `pickup:${location.id}`,
        kind: 'pickup' as const,
        label: location.name,
        locationId: location.id,
        addressRequired: false,
      })),
    ],
    payments: ['manual_pending', 'manual', 'cash', 'bank_transfer'].map((id) => ({
      id,
      label:
        id === 'manual_pending'
          ? 'Payment pending'
          : id === 'cash'
            ? 'Cash collected'
            : id === 'bank_transfer'
              ? 'Bank transfer'
              : 'Manual payment',
      custody,
      canRecordPayment:
        id !== 'manual_pending' && grant.capabilities.includes('RECORD_ORDER_PAYMENTS'),
    })),
    customerModes: [
      ...(grant.capabilities.includes('VIEW_ORDER_CUSTOMERS') ? ['existing' as const] : []),
      'guest',
      ...(grant.workspace === 'platform' && grant.capabilities.includes('CREATE_ORDER_CONTACTS')
        ? ['create_contact' as const]
        : []),
    ],
    adjustableFields: ['shippingCost', 'discount', 'taxRate'],
    limits: { lines: 250, quantity: 999, quoteLifetimeSeconds: 300 },
  };
}
function visibleCustomers(ctx: MockContext) {
  const grant = grantOf(ctx);
  return customers.filter(
    (customer) =>
      grant.workspace === 'platform' ||
      customer.id === 'guest:customer_green' ||
      customerOwners.get(customer.id) === grant.vendorId
  );
}
function stockRows(
  product: MockProduct,
  variantId: string | undefined,
  locationId?: string
): MockStock[] {
  const stock = variantId
    ? product.variants.find((variant) => variant.id === variantId)?.stock
    : product.stock;
  return locationId
    ? stock?.[locationId]
      ? [stock[locationId]!]
      : []
    : Object.values(stock ?? {});
}
function productSelector(
  ctx: MockContext,
  product: MockProduct,
  locationId?: string
): OrderProductSelector {
  const reason =
    product.status !== 'active' || product.priceOnRequest ? 'PRODUCT_NOT_ORDERABLE' : undefined;
  const quantity = (variantId?: string) =>
    stockRows(product, variantId, locationId).reduce((total, row) => total + row.available, 0);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    image:
      product.images?.[0] ??
      (product.pictures[0] ? image(product.pictures[0], product.name) : undefined),
    selectable: !reason,
    reason,
    price:
      !product.priceOnRequest && product.price !== undefined
        ? money(product.price, ctx.locale)
        : undefined,
    available: quantity(),
    untracked: product.untracked,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      available: quantity(variant.id),
      selectable: !reason && variant.price !== undefined,
      reason,
      price: variant.price === undefined ? undefined : money(variant.price, ctx.locale),
    })),
  };
}
function prepare(ctx: MockContext, draft: ManualOrderDraftRequest) {
  const policy = options(ctx);
  const delivery = policy.delivery.find((item) => item.id === draft.deliveryId);
  const payment = policy.payments.find((item) => item.id === draft.paymentMethod);
  if (!delivery) refusal('DELIVERY_NOT_ALLOWED');
  if (!payment) refusal('PAYMENT_METHOD_NOT_ALLOWED');
  if (draft.locationId && !policy.locations.some((item) => item.id === draft.locationId))
    refusal('LOCATION_NOT_ALLOWED');
  if (delivery.locationId && draft.locationId !== delivery.locationId)
    refusal('LOCATION_NOT_ALLOWED');
  if (delivery.addressRequired && !draft.shippingAddress) refusal('DELIVERY_NOT_ALLOWED');
  for (const address of [draft.shippingAddress, draft.billingAddress])
    if (address && !policy.countries.some((item) => item.code === address.country))
      refusal('DELIVERY_NOT_ALLOWED');
  if (delivery.kind === 'pickup' && draft.shippingCost) refusal('DELIVERY_NOT_ALLOWED');
  let customer: OrderCustomerSelector | ManualOrderDraftRequest['customer'];
  if (draft.customer.kind === 'existing') {
    requireCapability(ctx, 'VIEW_ORDER_CUSTOMERS');
    customer = visibleCustomers(ctx).find(
      (item) => item.id === (draft.customer as { id: string }).id
    )!;
    if (!customer) refusal('CUSTOMER_NOT_ALLOWED', 403);
  } else customer = draft.customer;
  const unique = new Map<string, ManualOrderDraftRequest['items'][number]>();
  for (const item of draft.items) {
    const key = `${item.productId}:${item.variantId ?? ''}`;
    unique.set(key, { ...item, quantity: item.quantity + (unique.get(key)?.quantity ?? 0) });
  }
  if (unique.size > policy.limits.lines) refusal('PRODUCT_NOT_ORDERABLE');
  const rows = [...unique.values()].map((item) => {
    const product = getMockProduct(ctx, item.productId);
    const variant = item.variantId
      ? product.variants.find((entry) => entry.id === item.variantId)
      : undefined;
    if (
      product.status !== 'active' ||
      product.priceOnRequest ||
      (product.variants.length && !variant) ||
      (item.variantId && !variant) ||
      item.quantity > policy.limits.quantity
    )
      refusal('PRODUCT_NOT_ORDERABLE');
    const price = variant?.price ?? product.price;
    if (price === undefined) refusal('PRODUCT_NOT_ORDERABLE');
    if (draft.locationId && !locationsOf(product.vendorId).includes(draft.locationId))
      refusal('LOCATION_NOT_ALLOWED');
    const held = stockRows(product, item.variantId, draft.locationId);
    // Left to the store, the stock comes from the first location holding all of it.
    const inventory =
      draft.locationId || product.untracked
        ? held
        : held.filter((row) => row.available >= item.quantity).slice(0, 1);
    if (
      !product.untracked &&
      inventory.reduce((sum, row) => sum + row.available, 0) < item.quantity
    )
      refusal('INSUFFICIENT_STOCK');
    return { ...item, product, variant, price, inventory };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);
  const shipping = draft.shippingCost ?? 0;
  const discount = draft.discount ?? 0;
  if (discount > subtotal + shipping) refusal('QUOTE_CHANGED');
  const tax = ((subtotal - discount) * (draft.taxRate ?? 0)) / 100;
  const totals = {
    subtotal: money(subtotal, ctx.locale),
    shipping: money(shipping, ctx.locale),
    discount: money(discount, ctx.locale),
    tax: money(tax, ctx.locale),
    total: money(subtotal + shipping - discount + tax, ctx.locale),
  };
  const signature = JSON.stringify({
    policy,
    rows: rows.map((row) => ({
      id: row.productId,
      variantId: row.variantId,
      quantity: row.quantity,
      price: row.price,
      version: row.product.updatedAt,
      inventory: row.inventory,
    })),
    customer,
    totals,
  });
  return { policy, delivery, payment, customer, rows, totals, signature };
}
function operation(
  ctx: MockContext,
  routeId: string,
  resource: OperationStatus['resources'][number]
): OperationStatus {
  const result: OperationStatus = {
    key: ctx.headers.get('idempotency-key')!,
    routeId,
    state: 'succeeded',
    resources: [resource],
    updatedAt: new Date().toISOString(),
  };
  keepMockOperation(ctx, result, (current) => {
    if (resource.kind === 'order') {
      canCreate(current);
      mockOrderDetail(current, resource.id);
    } else {
      requireCapability(current, 'CREATE_ORDER_CONTACTS');
      if (grantOf(current).workspace !== 'platform') refusal('CONTACT_CREATE_NOT_ALLOWED', 403);
    }
  });
  return result;
}
function authorizeContact(ctx: MockContext) {
  requireCapability(ctx, 'CREATE_ORDER_CONTACTS');
  if (grantOf(ctx).workspace !== 'platform') refusal('CONTACT_CREATE_NOT_ALLOWED', 403);
}
function authorizeCreation(ctx: MockContext) {
  canCreate(ctx);
  const input = ManualOrderCreateRequest.safeParse(ctx.body);
  if (!input.success) throw invalid('draft', 'Invalid create request');
  for (const item of input.data.draft.items) getMockProduct(ctx, item.productId);
  if (input.data.draft.customer.kind === 'existing') {
    requireCapability(ctx, 'VIEW_ORDER_CUSTOMERS');
    if (
      !visibleCustomers(ctx).some(
        (customer) => customer.id === (input.data.draft.customer as { id: string }).id
      )
    )
      refusal('CUSTOMER_NOT_ALLOWED', 403);
  }
  if (input.data.recordPayment) requireCapability(ctx, 'RECORD_ORDER_PAYMENTS');
}
export const routes: readonly MockRoute[] = [
  {
    method: 'GET',
    path: '/orders/creation/options',
    access: { capability: 'CREATE_ORDERS' },
    handle: options,
  },
  {
    method: 'GET',
    path: '/orders/creation/products',
    access: { capability: 'CREATE_ORDERS' },
    handle: (ctx) => {
      canCreate(ctx);
      const query = OrderProductSelectorQuery.safeParse({
        ...Object.fromEntries(ctx.query),
        limit: ctx.query.has('limit') ? Number(ctx.query.get('limit')) : undefined,
      });
      if (!query.success) throw invalid('query', 'Invalid selector query');
      const term = ctx.query.get('search')?.toLowerCase();
      const barcode = ctx.query.get('barcode');
      const locationId = ctx.query.get('locationId') ?? undefined;
      if (locationId && !options(ctx).locations.some((location) => location.id === locationId))
        refusal('LOCATION_NOT_ALLOWED');
      const rows = allMockProducts()
        .filter(
          (product) =>
            reaches(scopeOf(grantOf(ctx)), product.vendorId) &&
            (!term || `${product.name} ${product.sku ?? ''}`.toLowerCase().includes(term)) &&
            (!barcode ||
              product.barcode === barcode ||
              product.sku === barcode ||
              product.variants.some(
                (variant) => variant.barcode === barcode || variant.sku === barcode
              ))
        )
        .map((product) => productSelector(ctx, product, locationId));
      return pageOf(rows, ctx.query);
    },
  },
  {
    method: 'GET',
    path: '/orders/creation/customers',
    access: { capability: 'VIEW_ORDER_CUSTOMERS' },
    handle: (ctx) => {
      const query = OrderCustomerSelectorQuery.safeParse({
        ...Object.fromEntries(ctx.query),
        limit: ctx.query.has('limit') ? Number(ctx.query.get('limit')) : undefined,
      });
      if (!query.success) throw invalid('query', 'Invalid customer query');
      const term = query.data.search?.toLowerCase();
      return pageOf(
        visibleCustomers(ctx).filter(
          (item) =>
            !term ||
            `${item.name} ${item.email ?? ''} ${item.phone ?? ''}`.toLowerCase().includes(term)
        ),
        ctx.query
      );
    },
  },
  {
    method: 'POST',
    path: '/orders/creation/contacts',
    access: { capability: 'CREATE_ORDER_CONTACTS' },
    idempotent: true,
    authorize: authorizeContact,
    handle: (ctx) => {
      authorizeContact(ctx);
      const parsed = OrderContactCreateRequest.safeParse(ctx.body);
      if (!parsed.success) throw invalid('contact', 'Invalid contact');
      const request = parsed.data;
      const email = request.email.toLowerCase();
      if (customers.some((item) => item.kind === 'account' && item.email === email))
        refusal('CONTACT_CREATE_NOT_ALLOWED');
      const customer: OrderCustomerSelector = customers.find(
        (item) => item.email === email && item.kind === 'guest'
      ) ?? {
        id: `guest:contact_${state.nextId++}`,
        kind: 'guest',
        name: request.name,
        email,
        phone: request.phone,
        addresses: request.shippingAddress ? [request.shippingAddress] : [],
      };
      if (!customers.includes(customer)) customers.push(customer);
      customerOwners.set(customer.id, grantOf(ctx).vendorId);
      return {
        operation: operation(ctx, 'orders.creation.contacts.create', {
          kind: 'customer',
          id: customer.id,
        }),
        customer,
      };
    },
  },
  ...(['/orders/creation/quote', '/orders/creation/draft'] as const).map((path): MockRoute => ({
    method: 'POST',
    path,
    access: { capability: 'CREATE_ORDERS' },
    handle: (ctx) => {
      const parsed = ManualOrderDraftRequest.safeParse(ctx.body);
      if (!parsed.success) throw invalid('draft', 'Invalid manual order draft');
      const draft = parsed.data;
      const prepared = prepare(ctx, draft);
      const token = `manual-quote-${state.nextId++}`;
      const quote = ManualOrderQuote.parse({
        token,
        expiresAt: new Date(
          Date.now() + prepared.policy.limits.quoteLifetimeSeconds * 1000
        ).toISOString(),
        draftId: draft.draftId,
        lines: prepared.rows.map((row) => ({
          productId: row.productId,
          variantId: row.variantId,
          name: row.product.name,
          variantName: row.variant?.name,
          quantity: row.quantity,
          unitPrice: money(row.price, ctx.locale),
          total: money(row.price * row.quantity, ctx.locale),
        })),
        totals: prepared.totals,
        customer: {
          name: prepared.customer.name,
          email: prepared.customer.email,
          phone: prepared.customer.phone,
        },
        delivery: prepared.delivery,
        payment: { method: prepared.payment.id, ...prepared.payment },
        warnings: [],
      });
      quotes.set(token, {
        actor: accountOf(ctx).id,
        workspace: grantOf(ctx).workspace,
        draft: structuredClone(draft),
        signature: prepared.signature,
        quote,
      });
      return quote;
    },
  })),
  {
    method: 'POST',
    path: '/orders/creation',
    access: { capability: 'CREATE_ORDERS' },
    idempotent: true,
    authorize: authorizeCreation,
    handle: (ctx) => {
      canCreate(ctx);
      const parsed = ManualOrderCreateRequest.safeParse(ctx.body);
      if (!parsed.success) throw invalid('draft', 'Invalid create request');
      const { draft, quoteToken, recordPayment } = parsed.data;
      const key = ctx.headers.get('idempotency-key')!;
      const held = quotes.get(quoteToken);
      if (!held || held.actor !== accountOf(ctx).id || held.workspace !== grantOf(ctx).workspace)
        refusal('QUOTE_CHANGED');
      // A draft makes one order: another creation of it is pointed at the first.
      const draftKey = `${accountOf(ctx).id}|${grantOf(ctx).workspace}|${draft.draftId}`;
      const made = draftOrders.get(draftKey);
      if (made)
        throw new MockError(409, 'CONFLICT', 'This draft already made an order', {
          reason: 'OPERATION_RECONCILIATION_REQUIRED',
          details: { operation: made },
        });
      // A quote is used once: the creation that claims it keeps it, whatever
      // comes of it. Only the same tap (its key) may use it again.
      if (held.claimedBy && held.claimedBy !== key) refusal('QUOTE_CHANGED');
      if (Date.parse(held.quote.expiresAt) <= Date.now()) refusal('QUOTE_EXPIRED');
      held.claimedBy = key;
      const prepared = prepare(ctx, draft);
      if (
        JSON.stringify(draft) !== JSON.stringify(held.draft) ||
        prepared.signature !== held.signature
      )
        refusal('QUOTE_CHANGED');
      if (recordPayment && !prepared.payment.canRecordPayment)
        refusal('PAYMENT_RECORDING_NOT_ALLOWED', 403);
      const id = `manual_order_${state.nextId++}`;
      const now = new Date().toISOString();
      const consignments = new Map<string, MockOrder['consignments'][number]>();
      prepared.rows.forEach((row, index) => {
        const owner = row.product.vendorId ?? 'store';
        const part = consignments.get(owner) ?? {
          id: `${id}_${owner}`,
          vendorId: row.product.vendorId,
          status: 'pending',
          lineIndexes: [],
          pickup: prepared.delivery.kind === 'pickup',
        };
        part.lineIndexes.push(index);
        consignments.set(owner, part);
      });
      const order: MockOrder = {
        id,
        number: `M${state.nextId}`,
        placedAt: now,
        updatedAt: now,
        channel: 'manual',
        paymentStatus: recordPayment ? 'paid' : 'pending',
        paymentMethod: draft.paymentMethod,
        customer: {
          name: prepared.customer.name,
          email: prepared.customer.email,
          phone: prepared.customer.phone,
        },
        lines: prepared.rows.map((row) => ({
          productId: row.productId,
          variantId: row.variantId,
          name: row.product.name,
          variantName: row.variant?.name,
          sku: row.variant?.sku ?? row.product.sku,
          picture: row.product.pictures[0] ?? '',
          quantity: row.quantity,
          unitPrice: row.price,
          preOrder: false,
        })),
        consignments: [...consignments.values()],
        shipping: prepared.totals.shipping.amount,
        discount: prepared.totals.discount.amount,
        tax: prepared.totals.tax.amount,
        shippingAddress: draft.shippingAddress,
        billingAddress: draft.billingAddress ?? draft.shippingAddress,
        shippingMethod: prepared.delivery.label,
        customerNote: draft.notes,
        timeline: [
          {
            at: now,
            kind: 'order_placed',
            message: 'Manual order created',
            by: accountOf(ctx).name,
          },
        ],
      };
      // All validation precedes the atomic mock effect. Replay goes through the dispatcher.
      for (const row of prepared.rows)
        if (!row.product.untracked) {
          row.inventory[0]!.available -= row.quantity;
          row.inventory[0]!.committed += row.quantity;
          touchMockProduct(row.product);
        }
      putMockOrder(order);
      const receipt = operation(ctx, 'orders.creation.create', { kind: 'order', id });
      draftOrders.set(draftKey, receipt);
      return { operation: receipt, order: mockOrderDetail(ctx, id) };
    },
  },
];
