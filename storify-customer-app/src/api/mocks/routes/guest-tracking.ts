/** Tracking a guest's order. */
import { TrackOrderRequest } from '@/contracts/mobile/shop/v1';

import {
  contactMatches,
  countLookup,
  findGuestOrder,
  resetGuestTracking,
} from '../fixtures/guest-tracking';
import { MockError, type MockContext, type MockRoute } from '../kit';

import { invoicePdf } from './orders';

/** The guest's order the request names, as the store finds it: counted, and one answer for any miss. */
function lookUp(ctx: MockContext) {
  const request = TrackOrderRequest.safeParse(ctx.body);
  if (!request.success) {
    throw new MockError(400, 'VALIDATION_ERROR', 'Check the order number and contact');
  }
  const { orderNumber, contact } = request.data;

  const wait = countLookup(contact, Date.now());
  if (wait !== null) {
    throw new MockError(429, 'RATE_LIMIT_EXCEEDED', 'Too many lookups', undefined, undefined, {
      retryAfter: wait,
    });
  }

  // A wrong number and a wrong contact are the same answer.
  const order = contactMatches(contact) ? findGuestOrder(orderNumber, ctx.locale) : undefined;
  if (!order) throw new MockError(404, 'NOT_FOUND', 'Order not found');
  return order;
}

export const routes: MockRoute[] = [
  {
    method: 'POST',
    path: '/orders/track',
    handle: lookUp,
  },
  {
    // The real store answers the PDF itself; the mock's envelope carries its bytes (see `mockFile`).
    method: 'POST',
    path: '/orders/track/invoice',
    handle: (ctx) => ({ base64: btoa(invoicePdf(lookUp(ctx).number)) }),
  },
];

export const reset = resetGuestTracking;
