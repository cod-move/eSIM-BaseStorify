/**
 * Paying for an order. Like the store, the mock performs `POST /checkout/orders`
 * and `POST /checkout/stripe/intent` once per `Idempotency-Key` and answers a
 * repeat with the first answer; another body under the same key is refused. A
 * refused request frees its key. Words typed into the order note
 * (`PAYMENT_SWITCH`) ask for a lost answer, a busy store, a 503 or each way a
 * card payment can end.
 */
import {
  PlaceOrderRequest,
  REQUEST_HEADERS,
  StripeConfirmRequest,
  StripeIntentRequest,
  type PlacedOrder,
  type StripeConfirmation,
  type StripeIntent,
} from '@/contracts/mobile/shop/v1';

import {
  MOCK_ORDER_TOTAL,
  MOCK_STRIPE,
  mockStripeCustomer,
  PAYMENT_SWITCH,
  PENDING_CONFIRMS,
} from '../fixtures/payments';
import { money } from '../fixtures/shared';
import { MockError, type MockContext, type MockRoute } from '../kit';
import { state } from '../state';
import { guardOrder, recordOrder } from './checkout';

export const routes: MockRoute[] = [
  { method: 'POST', path: '/checkout/orders', handle: (ctx) => once(ctx, () => placeOrder(ctx)) },
  {
    method: 'POST',
    path: '/checkout/stripe/intent',
    handle: (ctx) => once(ctx, () => startPayment(ctx)),
  },
  { method: 'POST', path: '/checkout/stripe/confirm', handle: confirmPayment },
];

type Remembered = { route: string; fingerprint: string; answer: unknown };
type Intent = {
  owner: string | null;
  note: string;
  confirms: number;
  order?: { orderId: string; orderNumber: string };
};

/** What the first request under each key answered. */
const remembered = new Map<string, Remembered>();
/** The keys that were already answered busy or 503, or whose answer was already lost. */
const slowed = new Set<string>();
const lost = new Set<string>();
const intents = new Map<string, Intent>();

export function reset() {
  remembered.clear();
  slowed.clear();
  lost.clear();
  intents.clear();
}

/** Stands for an answer lost on the way back. It is not a `MockError`, so the app sees a dropped connection. */
class AnswerLost extends Error {
  constructor() {
    super('Mock store: the answer was lost on the way');
    this.name = 'AnswerLost';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The same value always gives the same text, whatever the order of its keys. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([a], [b]) => a.localeCompare(b)))
      : field
  );
}

/** Whose cart it is: the account's, or the guest's token. */
function ownerOf({ user, headers }: MockContext): string | null {
  return user ? `user:${user.id}` : headers.get(REQUEST_HEADERS.cartToken);
}

function noteOf(body: unknown): string {
  const note = (body as { customerNote?: unknown } | null)?.customerNote;
  return typeof note === 'string' ? note : '';
}

/** Performs a request once per `Idempotency-Key`, and answers a repeat with the first answer. */
export function once(ctx: MockContext, perform: () => unknown): unknown {
  const key = ctx.headers.get(REQUEST_HEADERS.idempotencyKey);
  if (!key || !UUID.test(key)) {
    throw new MockError(400, 'VALIDATION_ERROR', 'The Idempotency-Key header must be a UUID');
  }
  const scope = ownerOf(ctx) ?? `install:${ctx.headers.get(REQUEST_HEADERS.installId)}`;
  const id = `${scope}:${key}`;
  const route = `${ctx.method} ${ctx.path}`;
  const fingerprint = stable(ctx.body);

  const first = remembered.get(id);
  if (first) {
    if (first.route !== route || first.fingerprint !== fingerprint) {
      throw new MockError(422, 'IDEMPOTENCY_KEY_REUSED', 'This key was used for another request');
    }
    return first.answer;
  }

  const note = noteOf(ctx.body);
  if (!slowed.has(id)) {
    if (note.includes(PAYMENT_SWITCH.busy)) {
      slowed.add(id);
      throw new MockError(409, 'REQUEST_IN_PROGRESS', 'The first request with this key is running');
    }
    if (note.includes(PAYMENT_SWITCH.unavailable)) {
      slowed.add(id);
      throw new MockError(503, 'SERVICE_UNAVAILABLE', 'The payment could not be started');
    }
  }

  const answer = perform();
  remembered.set(id, { route, fingerprint, answer });
  if (note.includes(PAYMENT_SWITCH.lost) && !lost.has(id)) {
    lost.add(id);
    throw new AnswerLost();
  }
  return answer;
}

/** The cart the request pays for, which must hold something. */
function requireCart(ctx: MockContext): string {
  const owner = ownerOf(ctx);
  if (!owner || (state.carts.get(owner)?.length ?? 0) === 0) {
    throw new MockError(409, 'CONFLICT', 'Your cart is empty', 'CART_EMPTY');
  }
  return owner;
}

function invalid(fields: string[] = ['body']): never {
  throw new MockError(
    400,
    'VALIDATION_ERROR',
    'Some fields need attention',
    undefined,
    Object.fromEntries(fields.map((field) => [field, ['Invalid value']]))
  );
}

function writeOrder(owner: string | null) {
  const id = state.nextId++;
  // The order took the cart's lines.
  if (owner) state.carts.delete(owner);
  return { orderId: `ord_m${id}`, orderNumber: String(3000 + id) };
}

/** POST /checkout/orders: cash on delivery. */
function placeOrder(ctx: MockContext): PlacedOrder {
  const request = PlaceOrderRequest.safeParse(ctx.body);
  if (!request.success) invalid();
  const owner = requireCart(ctx);
  const quote = guardOrder(ctx, request.data);
  const placed = writeOrder(owner);
  recordOrder(quote, request.data, placed);
  return {
    ...placed,
    paymentMethod: 'cod',
    total: money(MOCK_ORDER_TOTAL, ctx.locale),
  };
}

/** POST /checkout/stripe/intent: what the Payment Sheet needs. No order exists until it is confirmed. */
function startPayment(ctx: MockContext): StripeIntent {
  if (!StripeIntentRequest.safeParse(ctx.body).success) invalid();
  const owner = requireCart(ctx);
  const paymentIntentId = `pi_mock_${state.nextId++}`;
  intents.set(paymentIntentId, { owner, note: noteOf(ctx.body), confirms: 0 });
  return {
    paymentIntentId,
    clientSecret: `${paymentIntentId}_secret_mock`,
    ...MOCK_STRIPE,
    amount: money(MOCK_ORDER_TOTAL, ctx.locale),
    // A guest is never sent a Customer.
    ...(ctx.user ? { customer: mockStripeCustomer(ctx.user.id) } : {}),
  };
}

/** POST /checkout/stripe/confirm: how the payment ended. Asking again answers the same order. */
function confirmPayment(ctx: MockContext): StripeConfirmation {
  const request = StripeConfirmRequest.safeParse(ctx.body);
  if (!request.success) invalid();
  const intent = intents.get(request.data.paymentIntentId);
  // Anybody but the shopper it was started for gets the answer of an unknown id.
  if (!intent || intent.owner !== ownerOf(ctx)) {
    throw new MockError(404, 'NOT_FOUND', 'No such payment');
  }
  intent.confirms += 1;

  const { note } = intent;
  if (note.includes(PAYMENT_SWITCH.notPaid)) {
    return { outcome: 'NOT_PAID', paymentStatus: 'requires_payment_method' };
  }
  if (note.includes(PAYMENT_SWITCH.pending) && intent.confirms <= PENDING_CONFIRMS) {
    return { outcome: 'PENDING', paymentStatus: 'processing' };
  }
  if (note.includes(PAYMENT_SWITCH.returned)) {
    return { outcome: 'PAYMENT_RETURNED', paymentStatus: 'succeeded' };
  }
  if (note.includes(PAYMENT_SWITCH.cancelled)) {
    return {
      outcome: 'ORDER_CANCELLED',
      paymentStatus: 'succeeded',
      refunded: money(MOCK_ORDER_TOTAL, ctx.locale),
    };
  }
  intent.order ??= writeOrder(intent.owner);
  return { outcome: 'ORDER_PLACED', paymentStatus: 'succeeded', ...intent.order };
}
