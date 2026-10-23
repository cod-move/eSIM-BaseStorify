/**
 * Orders: the list (tabs, search, a customer's), one order, and the workflow's next step.
 *
 * Who sees what follows the API: the store's operators see whole orders; a
 * seller sees the orders with a consignment of theirs, and on each only that
 * consignment; a seller's staff see orders wholly their seller's, whole.
 */
import {
  ORDER_ACTIONS,
  ORDER_LIST_TABS,
  type OrderAction,
  type OrderDetail,
  type OrderListItem,
  type OrderTotals,
} from '@/contracts/mobile/biz/v1';

import type { MockGrant } from '../fixtures/accounts';
import { VENDORS } from '../fixtures/accounts';
import { customerByEmail, customerById, type MockCustomer } from '../fixtures/customers';
import {
  seedOrders,
  type MockConsignment,
  type MockLine,
  type MockOrder,
} from '../fixtures/orders';
import { image, limitOf, money, notFound, oneOf, searchOf, textOf } from '../fixtures/shared';
import {
  MockError,
  accountOf,
  bodyOf,
  grantOf,
  invalid,
  requireCapability,
  type MockContext,
  type MockRoute,
} from '../kit';
import { scopeOf, type MockScope } from '../scope';

let orders = seedOrders();
/** Manual creation uses the same queue/detail and fulfillment state. */
export const allMockOrders = () => orders;
export const putMockOrder = (order: MockOrder) => {
  orders = [order, ...orders];
};
export const mockOrderDetail = (ctx: MockContext, id: string) =>
  detailOf(orderOf(ctx, id), grantOf(ctx), ctx.locale);
/** Orders somebody else will move just before this app's next action on them (`raceNextOrderAction`). */
const races = new Map<string, (order: MockOrder) => void>();
/** Refusals the next action on an order meets (`refuseNextOrderAction`). */
const refusals = new Map<string, MockError>();

export function reset(): void {
  orders = seedOrders();
  races.clear();
  refusals.clear();
}

/**
 * For tests: the next action on this order loses a race. Somebody else's
 * change lands between the app's read and its write, and the action answers
 * 409 `ORDER_STATE_CHANGED` with the order as it then is.
 */
export function raceNextOrderAction(id: string, change: (order: MockOrder) => void): void {
  races.set(id, change);
}

/**
 * For tests: the next action on this order is refused with this reason, for
 * the store's refusals the mock has no rule of its own for (a payment still
 * being settled, a pre-order's balance due …). Nothing moves.
 */
export function refuseNextOrderAction(
  id: string,
  refusal: { status: number; code: string; reason: string; errors?: Record<string, string[]> }
): void {
  refusals.set(
    id,
    new MockError(refusal.status, refusal.code, `Refused: ${refusal.reason}`, {
      reason: refusal.reason,
      ...(refusal.errors ? { errors: refusal.errors } : {}),
    })
  );
}

/**
 * For tests: somebody else changes an order (a colleague's step on the
 * website, a payment arriving). The next read sees it.
 */
export function changeMockOrder(id: string, change: (order: MockOrder) => void): void {
  const order = orders.find((candidate) => candidate.id === id);
  if (!order) throw new Error(`The mock store has no order ${id}`);
  change(order);
  order.updatedAt = new Date().toISOString();
}

// ─── Statuses ────────────────────────────────────────────────────────────────

const PROGRESS = ['preordered', 'pending', 'processing', 'shipped', 'delivered'];
const CANCELLABLE = new Set(['preordered', 'pending', 'processing']);
/** Payment states in which cancelling would give money back. */
const PAID = new Set(['paid', 'partially_paid']);

/** The order's status: the least advanced of its live consignments, or cancelled when none is live. */
function statusOf(order: MockOrder): string {
  const live = order.consignments.filter((consignment) => consignment.status !== 'cancelled');
  if (live.length === 0) return 'cancelled';
  return live
    .map((consignment) => consignment.status)
    .sort((a, b) => PROGRESS.indexOf(a) - PROGRESS.indexOf(b))[0] as string;
}

/** The step that follows a status, when there is one. */
function nextStep(status: string): OrderAction | null {
  if (status === 'pending' || status === 'preordered') return 'mark_processing';
  if (status === 'processing') return 'mark_shipped';
  if (status === 'shipped') return 'mark_delivered';
  return null;
}

// ─── Who sees what ───────────────────────────────────────────────────────────

/** A seller's own consignment of an order. */
function sellersPart(order: MockOrder, scope: MockScope): MockConsignment | undefined {
  return scope.kind === 'seller'
    ? order.consignments.find((consignment) => consignment.vendorId === scope.vendorId)
    : undefined;
}

function reaches(order: MockOrder, scope: MockScope): boolean {
  if (scope.kind === 'store') return true;
  if (scope.kind === 'seller') return sellersPart(order, scope) !== undefined;
  return order.consignments.every((consignment) => consignment.vendorId === scope.vendorId);
}

/** The orders in reach, newest first. */
function inScope(scope: MockScope): MockOrder[] {
  return orders.filter((order) => reaches(order, scope));
}

function orderOf(ctx: MockContext, id: string): MockOrder {
  const order = inScope(scopeOf(grantOf(ctx))).find((candidate) => candidate.id === id);
  if (!order) throw notFound('Order');
  return order;
}

/** What the operator sees of an order: the whole of it, or a seller's consignment. */
type View = {
  status: string;
  lines: { line: MockLine; index: number }[];
  consignments: MockConsignment[];
  shipping: number;
  tax: number;
  discount: number;
  refunded?: number;
};

function viewOf(order: MockOrder, scope: MockScope): View {
  const part = sellersPart(order, scope);
  if (!part) {
    return {
      status: statusOf(order),
      lines: order.lines.map((line, index) => ({ line, index })),
      consignments: order.consignments,
      shipping: order.shipping,
      tax: order.tax,
      discount: order.discount,
      refunded: order.refunded,
    };
  }
  // A seller's consignment: its lines, numbered within it; its share of delivery.
  return {
    status: part.status,
    lines: part.lineIndexes.flatMap((at, index) => {
      const line = order.lines[at];
      return line ? [{ line, index }] : [];
    }),
    consignments: [{ ...part, lineIndexes: part.lineIndexes.map((_, index) => index) }],
    shipping: order.shipping / order.consignments.length,
    tax: 0,
    discount: 0,
  };
}

function subtotalOf(view: View): number {
  return view.lines.reduce((total, { line }) => total + line.unitPrice * line.quantity, 0);
}

function totalOf(view: View): number {
  return subtotalOf(view) + view.shipping + view.tax - view.discount;
}

function totalsOf(view: View, locale: string): OrderTotals {
  return {
    subtotal: money(subtotalOf(view), locale),
    shipping: money(view.shipping, locale),
    tax: money(view.tax, locale),
    discount: money(view.discount, locale),
    total: money(totalOf(view), locale),
    ...(view.refunded ? { refunded: money(view.refunded, locale) } : {}),
  };
}

function consignmentTotal(order: MockOrder, consignment: MockConsignment): number {
  const lines = consignment.lineIndexes.reduce((total, at) => {
    const line = order.lines[at];
    return total + (line ? line.unitPrice * line.quantity : 0);
  }, 0);
  return lines + order.shipping / order.consignments.length;
}

// ─── What may be done ────────────────────────────────────────────────────────

/**
 * Whether marking the whole order shipped would ship a consignment collected
 * in person: the step goes to every live one, and such a one has nothing to
 * ship (`PICKUP_CONSIGNMENT`).
 */
function collectedInPerson(order: MockOrder): boolean {
  return order.consignments.some(
    (consignment) => consignment.status !== 'cancelled' && consignment.pickup
  );
}

/** The actions a hint shows for one status: the next step and cancel, as the grant allows. */
function actionsFor(
  status: string,
  order: MockOrder,
  grant: MockGrant,
  { pickup }: { pickup: boolean }
): OrderAction[] {
  const actions: OrderAction[] = [];
  const step = nextStep(status);
  const holdsShipping = step === 'mark_shipped' && (order.addressHold || pickup);
  if (step && !holdsShipping && grant.capabilities.includes('EDIT_ORDERS')) actions.push(step);
  // Cancel is offered only where it needs no refund: the app never refunds.
  if (
    CANCELLABLE.has(status) &&
    !PAID.has(order.paymentStatus) &&
    grant.capabilities.includes('CANCEL_ORDERS')
  ) {
    actions.push('cancel');
  }
  return actions;
}

function consignmentActions(
  order: MockOrder,
  consignment: MockConsignment,
  grant: MockGrant,
  scope: MockScope
): OrderAction[] {
  if (scope.kind === 'seller') return actionsFor(consignment.status, order, grant, consignment);
  // The store's operators call off one seller's part of a split order.
  const live = order.consignments.filter((candidate) => candidate.status !== 'cancelled');
  const canCancel =
    scope.kind === 'store' &&
    live.length > 1 &&
    CANCELLABLE.has(consignment.status) &&
    !PAID.has(order.paymentStatus) &&
    grant.capabilities.includes('CANCEL_ORDERS');
  return canCancel ? ['cancel'] : [];
}

// ─── Answers ─────────────────────────────────────────────────────────────────

function listItemOf(order: MockOrder, scope: MockScope, locale: string): OrderListItem {
  const view = viewOf(order, scope);
  return {
    id: order.id,
    number: order.number,
    status: view.status,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt,
    ...(order.customer?.name ? { customerName: order.customer.name } : {}),
    itemCount: view.lines.reduce((total, { line }) => total + line.quantity, 0),
    total: money(totalOf(view), locale),
    preOrder: view.lines.some(({ line }) => line.preOrder),
    channel: order.channel,
  };
}

function detailOf(order: MockOrder, grant: MockGrant, locale: string): OrderDetail {
  const scope = scopeOf(grant);
  const view = viewOf(order, scope);
  const seller = scope.kind === 'seller';
  const own = sellersPart(order, scope);

  return {
    id: order.id,
    number: order.number,
    status: view.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    placedAt: order.placedAt,
    channel: order.channel,
    ...(view.status === 'cancelled' && (own?.cancelledAt ?? order.cancelledAt)
      ? { cancelledAt: own?.cancelledAt ?? order.cancelledAt }
      : {}),
    // Sellers never get the reason, as on the website.
    ...(!seller && order.cancelReason ? { cancelReason: order.cancelReason } : {}),
    customer: customerOf(order, grant),
    lines: view.lines.map(({ line, index }) => ({
      index,
      productId: line.productId,
      ...(line.variantId ? { variantId: line.variantId } : {}),
      name: line.name,
      ...(line.variantName ? { variantName: line.variantName } : {}),
      image: image(line.picture, line.name),
      ...(line.sku ? { sku: line.sku } : {}),
      quantity: line.quantity,
      unitPrice: money(line.unitPrice, locale),
      lineTotal: money(line.unitPrice * line.quantity, locale),
      preOrder: line.preOrder,
    })),
    totals: totalsOf(view, locale),
    ...(order.shippingAddress ? { shippingAddress: order.shippingAddress } : {}),
    ...(!seller && order.billingAddress ? { billingAddress: order.billingAddress } : {}),
    ...(order.shippingMethod ? { shippingMethod: order.shippingMethod } : {}),
    consignments: view.consignments.map((consignment) => {
      const vendor = consignment.vendorId ? VENDORS[consignment.vendorId] : undefined;
      const original =
        order.consignments.find((candidate) => candidate.id === consignment.id) ?? consignment;
      return {
        id: consignment.id,
        ...(vendor ? { vendorId: vendor.id, vendorName: vendor.name } : {}),
        status: consignment.status,
        lineIndexes: consignment.lineIndexes,
        total: money(consignmentTotal(order, original), locale),
        pickup: consignment.pickup,
        ...(consignment.tracking ? { tracking: consignment.tracking } : {}),
        ...(consignment.shippedAt ? { shippedAt: consignment.shippedAt } : {}),
        ...(consignment.deliveredAt ? { deliveredAt: consignment.deliveredAt } : {}),
        ...(consignment.cancelledAt ? { cancelledAt: consignment.cancelledAt } : {}),
        actions: consignmentActions(order, original, grant, scope),
      };
    }),
    ...(order.customerNote ? { customerNote: order.customerNote } : {}),
    ...(order.addressHold ? { addressHold: order.addressHold } : {}),
    timeline: own ? sellerTimeline(order, own) : order.timeline,
    actions: own
      ? actionsFor(own.status, order, grant, own)
      : actionsFor(statusOf(order), order, grant, { pickup: collectedInPerson(order) }),
    updatedAt: order.updatedAt,
  };
}

/** A seller sees their consignment's own steps, newest first. */
function sellerTimeline(order: MockOrder, part: MockConsignment) {
  return [
    ...(part.cancelledAt
      ? [{ at: part.cancelledAt, kind: 'cancelled', message: 'Cancelled' }]
      : []),
    ...(part.deliveredAt
      ? [{ at: part.deliveredAt, kind: 'delivered', message: 'Delivered' }]
      : []),
    ...(part.shippedAt ? [{ at: part.shippedAt, kind: 'shipped', message: 'Shipped' }] : []),
    { at: order.placedAt, kind: 'placed', message: 'Order placed' },
  ];
}

// ─── Taking a step ───────────────────────────────────────────────────────────

function conflict(reason: string, message: string, details?: Record<string, unknown>): MockError {
  return new MockError(409, 'CONFLICT', message, { reason, ...(details ? { details } : {}) });
}

/** Moves consignments to a status, with the times and the events the store records. */
function move(
  order: MockOrder,
  parts: MockConsignment[],
  to: string,
  by: string,
  extra: { carrier?: string; trackingNumber?: string; reason?: string }
): void {
  const now = new Date().toISOString();
  const before = statusOf(order);
  for (const part of parts) {
    part.status = to;
    if (to === 'shipped') {
      part.shippedAt = now;
      part.tracking = { carrier: extra.carrier, number: extra.trackingNumber };
    }
    if (to === 'delivered') part.deliveredAt = now;
    if (to === 'cancelled') part.cancelledAt = now;
  }
  // Cash on delivery is collected when the last parcel arrives.
  if (to === 'delivered' && order.paymentMethod === 'cod' && statusOf(order) === 'delivered') {
    order.paymentStatus = 'paid';
  }
  if (statusOf(order) === 'cancelled') {
    order.cancelledAt = now;
    if (extra.reason) order.cancelReason = extra.reason;
  }
  order.timeline.unshift({
    at: now,
    kind: 'status_change',
    message: `Status changed from ${before} to ${statusOf(order)}`,
    by,
  });
  order.updatedAt = now;
}

function act(ctx: MockContext, order: MockOrder): void {
  const grant = grantOf(ctx);
  const scope = scopeOf(grant);
  const body = bodyOf(ctx);
  const action = body.action as OrderAction;
  if (!(ORDER_ACTIONS as readonly unknown[]).includes(action)) {
    throw invalid('action', `Expected one of: ${ORDER_ACTIONS.join(', ')}`);
  }
  const consignmentId = textOf(body, 'consignmentId');
  const carrier = textOf(body, 'carrier');
  const trackingNumber = textOf(body, 'trackingNumber');
  const reason = textOf(body, 'reason');

  // Cancelling is a permission of its own, apart from moving an order on (contract: me.ts).
  requireCapability(ctx, action === 'cancel' ? 'CANCEL_ORDERS' : 'EDIT_ORDERS');
  if (action === 'mark_shipped' && (!carrier || !trackingNumber)) {
    throw new MockError(
      400,
      'VALIDATION_ERROR',
      'Marking it shipped needs a carrier and a tracking number',
      {
        reason: 'TRACKING_REQUIRED',
        errors: {
          ...(carrier ? {} : { carrier: ['Required'] }),
          ...(trackingNumber ? {} : { trackingNumber: ['Required'] }),
        },
      }
    );
  }
  if (consignmentId && (scope.kind !== 'store' || action !== 'cancel')) {
    throw invalid('consignmentId', 'Only the store cancels one consignment of an order');
  }

  const refusal = refusals.get(order.id);
  if (refusal) {
    refusals.delete(order.id);
    throw refusal;
  }

  // Somebody else's change lands first: the write finds the order moved.
  const race = races.get(order.id);
  if (race) {
    races.delete(order.id);
    race(order);
    order.updatedAt = new Date().toISOString();
    throw conflict('ORDER_STATE_CHANGED', 'This order was changed by someone else', {
      order: detailOf(order, grant, ctx.locale),
    });
  }

  // The parts the step applies to: a seller's consignment, one consignment, or every live one.
  const own = sellersPart(order, scope);
  let parts: MockConsignment[];
  if (own) {
    parts = [own];
  } else if (consignmentId) {
    const part = order.consignments.find((candidate) => candidate.id === consignmentId);
    if (!part) throw notFound('Consignment');
    if (!reason) throw invalid('reason', 'Say why this part is cancelled');
    const live = order.consignments.filter((candidate) => candidate.status !== 'cancelled');
    if (part.status === 'cancelled' || live.length < 2) {
      throw conflict('TRANSITION_NOT_ALLOWED', 'Cancel the whole order instead');
    }
    parts = [part];
  } else {
    parts = order.consignments.filter((candidate) => candidate.status !== 'cancelled');
  }

  const from = own ? own.status : consignmentId ? (parts[0]?.status ?? '') : statusOf(order);
  const allowed = action === 'cancel' ? CANCELLABLE.has(from) : nextStep(from) === action;
  if (!allowed)
    throw conflict('TRANSITION_NOT_ALLOWED', `An order that is ${from} cannot take this step`);

  if (action === 'cancel' && PAID.has(order.paymentStatus)) {
    throw conflict(
      'CANCEL_NEEDS_REFUND',
      'This order has been paid; cancel it on the website to refund it'
    );
  }
  if (action === 'mark_shipped' && order.addressHold) {
    throw conflict('ADDRESS_ON_HOLD', 'Shipping waits for the customer to check the address');
  }
  if (action === 'mark_shipped' && parts.some((part) => part.pickup)) {
    throw conflict('PICKUP_CONSIGNMENT', 'Collected in person: there is nothing to ship');
  }

  const to = {
    mark_processing: 'processing',
    mark_shipped: 'shipped',
    mark_delivered: 'delivered',
    cancel: 'cancelled',
  }[action];
  move(order, parts, to, accountOf(ctx).name, {
    carrier: carrier ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    reason: reason ?? undefined,
  });
}

// ─── A customer's orders ─────────────────────────────────────────────────────

/** The order's customer as the operator sees them, with their id for one who may see customers. */
function customerOf(order: MockOrder, grant: MockGrant): OrderDetail['customer'] {
  if (!order.customer) return {};
  const known = grant.capabilities.includes('VIEW_ORDER_CUSTOMERS')
    ? customerByEmail(order.customer.email)
    : undefined;
  return known ? { id: known.id, ...order.customer } : order.customer;
}

/** A customer's orders in reach, newest first (the store links them by the email they carry). */
export function customerOrders(scope: MockScope, customer: MockCustomer): MockOrder[] {
  return inScope(scope).filter((order) => order.customer?.email === customer.email);
}

/** Paid (refunded too: the money came in first), or delivered; never cancelled. */
const COLLECTED = new Set(['paid', 'partially_paid', 'partially_refunded', 'refunded']);

/**
 * A customer's figures from the orders in reach, as the API counts them: how
 * many, the first and the latest, and what was paid, by the whole order for
 * the store's operators and by the seller's items for a seller (a consignment
 * cancelled on its own left out); the latest order's delivery address.
 */
export function customerOrderFigures(scope: MockScope, customer: MockCustomer) {
  const theirs = customerOrders(scope, customer);
  let spent = 0;
  for (const order of theirs) {
    const view = viewOf(order, scope);
    if (view.status === 'cancelled') continue;
    if (!COLLECTED.has(order.paymentStatus) && view.status !== 'delivered') continue;
    spent += scope.kind === 'store' ? totalOf(view) : subtotalOf(view);
  }
  const placed = theirs.map((order) => order.placedAt).sort();
  return {
    orderCount: theirs.length,
    spent,
    firstOrderAt: placed[0],
    lastOrderAt: placed.at(-1),
    latestAddress: theirs[0]?.shippingAddress,
  };
}

// ─── What Home counts ────────────────────────────────────────────────────────

/** Orders in reach, each as its operator sees it: for Home's figures. */
export function orderFigures(scope: MockScope) {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  let collectedToday = 0;
  let collectedThisMonth = 0;
  let needingAction = 0;
  const collectedDays = new Map<string, number>();

  for (const order of inScope(scope)) {
    const view = viewOf(order, scope);
    if (view.status === 'pending' || view.status === 'processing') needingAction += 1;
    if (order.paymentStatus !== 'paid') continue;
    const day = order.placedAt.slice(0, 10);
    collectedDays.set(day, (collectedDays.get(day) ?? 0) + totalOf(view));
    if (order.placedAt.startsWith(today)) collectedToday += totalOf(view);
    if (order.placedAt.startsWith(month)) collectedThisMonth += totalOf(view);
  }
  return { collectedToday, collectedThisMonth, needingAction, collectedDays };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * One page of a list of orders, by the request's `cursor` and `limit`. The
 * cursor names the last order shown, and the next page continues after it in
 * the store's order (newest first), as the contract's does: an order that
 * left the tab between two pages (a colleague shipped it) takes no row of
 * the next page with it.
 */
function ordersAfter(rows: readonly MockOrder[], query: URLSearchParams) {
  const cursor = query.get('cursor');
  const limit = limitOf(query);
  let start = 0;
  if (cursor) {
    const last = orders.findIndex((order) => `after:${order.id}` === cursor);
    // The API answers a cursor it did not give out with 400.
    if (last < 0) throw invalid('cursor', 'This cursor was not given out by the store');
    start = rows.findIndex((order) => orders.indexOf(order) > last);
    if (start < 0) start = rows.length;
  }
  const items = rows.slice(start, start + limit);
  const end = items.at(-1);
  return {
    items,
    nextCursor: end && start + limit < rows.length ? `after:${end.id}` : null,
  };
}

const TAB_STATUSES: Record<string, string[]> = {
  needs_action: ['pending', 'processing'],
  shipped: ['shipped'],
  delivered: ['delivered'],
  cancelled: ['cancelled'],
};

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/orders',
    access: { capability: 'VIEW_ORDERS' },
    handle: (ctx) => {
      const scope = scopeOf(grantOf(ctx));
      const tab = oneOf(ctx.query, 'tab', ORDER_LIST_TABS) ?? 'all';
      const search = searchOf(ctx.query);
      const customerId = ctx.query.get('customerId');
      // One customer's: their orders within the scope; nobody's for an unknown id.
      const customer = customerId ? customerById(customerId) : undefined;
      const source = customerId
        ? customer
          ? customerOrders(scope, customer)
          : []
        : inScope(scope);

      const rows = source.filter((order) => {
        const view = viewOf(order, scope);
        if (tab === 'pre_orders') {
          if (!view.lines.some(({ line }) => line.preOrder)) return false;
          if (!CANCELLABLE.has(view.status)) return false;
        } else if (tab !== 'all' && !TAB_STATUSES[tab]?.includes(view.status)) {
          return false;
        }
        if (!search) return true;
        const customer = order.customer;
        return [order.number, customer?.name, customer?.email, customer?.phone].some((field) =>
          field?.toLowerCase().includes(search)
        );
      });

      const page = ordersAfter(rows, ctx.query);
      return { ...page, items: page.items.map((order) => listItemOf(order, scope, ctx.locale)) };
    },
  },
  {
    method: 'POST',
    path: /^\/orders\/([^/]+)\/actions$/,
    // Which step needs which capability is checked with the body (`act`).
    access: { capability: 'VIEW_ORDERS' },
    idempotent: true,
    handle: (ctx, [id = '']) => {
      const order = orderOf(ctx, id);
      act(ctx, order);
      return { order: detailOf(order, grantOf(ctx), ctx.locale) };
    },
  },
  {
    method: 'GET',
    path: /^\/orders\/([^/]+)$/,
    access: { capability: 'VIEW_ORDERS' },
    handle: (ctx, [id = '']) => detailOf(orderOf(ctx, id), grantOf(ctx), ctx.locale),
  },
];
