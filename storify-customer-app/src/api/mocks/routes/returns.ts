/**
 * Returns: the options, the refund preview and the request of an order, and
 * the shopper's returns. The request is performed once per `Idempotency-Key`,
 * as the store does; a refusal answers with the store's reason and sentence.
 */
import type * as z from 'zod';

import {
  CreateReturnRequest,
  ReturnPreviewRequest,
  type RefundDestinationBody,
} from '@/contracts/mobile/shop/v1';

import { findOrder } from '../fixtures/orders';
import {
  NOTE_REASON,
  createReturns,
  findReturn,
  isReason,
  lineReturnability,
  listReturns,
  needsDestination,
  optionsFor,
  previewFor,
  resetReturns,
  throughStore,
  toShopperReturn,
  type ReturnableOrder,
} from '../fixtures/returns';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';
import { once } from './payments';

function orderOf(ctx: MockContext, id: string): ReturnableOrder {
  requireUser(ctx);
  const order = findOrder(id);
  // Another shopper's order and a made-up id look the same: 404, never 403.
  if (!order) throw new MockError(404, 'NOT_FOUND', 'Order not found');
  return order;
}

function invalid(field: string, message: string, reason?: string): never {
  throw new MockError(400, 'VALIDATION_ERROR', message, reason, { [field]: [message] });
}

const BLOCKED_MESSAGES: Record<string, string> = {
  NOT_RETURNABLE: 'This item has not been delivered yet, so it cannot be returned.',
  FINAL_SALE: 'This item was sold as final sale.',
  RETURN_WINDOW_CLOSED: 'The return window for this item has closed.',
};

/** The checks the preview and the request share: the order, the lines, the reason. */
function checkSelection(order: ReturnableOrder, body: ReturnPreviewRequest): void {
  if (throughStore(order)) {
    throw new MockError(
      409,
      'CONFLICT',
      'This seller takes returns through our team. Please contact us.',
      'RETURNS_THROUGH_STORE'
    );
  }
  const seen = new Set<number>();
  for (const line of body.lines) {
    if (seen.has(line.index)) invalid('lines', 'Each line may be chosen once');
    seen.add(line.index);
    if (!order.lines[line.index]) invalid('lines', 'Unknown line');
    const { returnable, blocked } = lineReturnability(order, line.index);
    if (returnable === 0 && blocked) {
      throw new MockError(409, 'CONFLICT', BLOCKED_MESSAGES[blocked] ?? blocked, blocked);
    }
    if (line.quantity > returnable) {
      throw new MockError(
        409,
        'CONFLICT',
        `Only ${returnable} of this item can still be returned.`,
        'QUANTITY_EXCEEDS',
        undefined,
        { index: line.index, returnable }
      );
    }
  }
  if (!isReason(body.reason)) invalid('reason', 'Choose one of the reasons');
}

function checkDestination(order: ReturnableOrder, destination?: RefundDestinationBody): void {
  if (!needsDestination(order)) return;
  const message = 'Tell us where to send your refund.';
  const method = optionsFor(order).refundDestination.methods.find(
    (candidate) => candidate.method === destination?.method
  );
  if (!destination || !method) invalid('refundDestination', message, 'REFUND_DESTINATION_REQUIRED');
  const given = new Map<string, unknown>(Object.entries(destination));
  for (const field of method.fields) {
    const value = given.get(field.key);
    if (field.required && !(typeof value === 'string' && value.trim())) {
      invalid(`refundDestination.${field.key}`, message, 'REFUND_DESTINATION_REQUIRED');
    }
  }
}

function parsed<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) invalid('body', 'Some fields need attention');
  return result.data;
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: /^\/orders\/([^/]+)\/returns\/options$/,
    handle: (ctx, [id = '']) => optionsFor(orderOf(ctx, id)),
  },
  {
    method: 'POST',
    path: /^\/orders\/([^/]+)\/returns\/preview$/,
    handle: (ctx, [id = '']) => {
      const order = orderOf(ctx, id);
      const body = parsed(ReturnPreviewRequest, ctx.body);
      checkSelection(order, body);
      return previewFor(order, body, ctx.locale);
    },
  },
  {
    method: 'POST',
    path: /^\/orders\/([^/]+)\/returns$/,
    handle: (ctx, [id = '']) => {
      const order = orderOf(ctx, id);
      return once(ctx, () => {
        const body = parsed(CreateReturnRequest, ctx.body);
        checkSelection(order, body);
        if (body.reason === NOTE_REASON && !body.note?.trim()) {
          invalid('note', 'Tell us a little more about the reason.', 'NOTE_REQUIRED');
        }
        checkDestination(order, body.refundDestination);
        return { returns: createReturns(order, body, ctx.locale) };
      });
    },
  },
  {
    method: 'GET',
    path: '/me/returns',
    handle: (ctx) => {
      requireUser(ctx);
      const cursor = ctx.query.get('cursor');
      const offset = cursor === null ? 0 : Number(cursor);
      if (!Number.isInteger(offset) || offset < 0) {
        throw new MockError(400, 'VALIDATION_ERROR', 'Unknown cursor');
      }
      const limit = Math.min(Math.max(Number(ctx.query.get('limit') ?? 20), 1), 40);
      const all = listReturns();
      return {
        items: all
          .slice(offset, offset + limit)
          .map((stored) => toShopperReturn(stored, ctx.locale)),
        nextCursor: offset + limit < all.length ? String(offset + limit) : null,
      };
    },
  },
  {
    method: 'GET',
    path: /^\/me\/returns\/([^/]+)$/,
    handle: (ctx, [id = '']) => {
      requireUser(ctx);
      const stored = findReturn(id);
      if (!stored) throw new MockError(404, 'NOT_FOUND', 'Return not found');
      return toShopperReturn(stored, ctx.locale);
    },
  },
];

export const reset = resetReturns;
