/** Endpoints: returns. Whether an order can be returned is on the order itself. */
import {
  CreatedReturns,
  ReturnOptions,
  ReturnPreview,
  ShopperReturn,
  ShopperReturnList,
  type CreateReturnRequest,
  type ReturnPreviewRequest,
  type ShopperReturnListQuery,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';

const orderPath = (orderId: string) => `/orders/${encodeURIComponent(orderId)}/returns`;

/** The reasons to choose from, and whether the refund needs a destination. */
export function getReturnOptions(locale: string, orderId: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `${orderPath(orderId)}/options`, auth: 'user', signal },
    ReturnOptions
  );
}

/** The refund as the store would pay it for this selection. Nothing is written. */
export function previewReturn(
  locale: string,
  orderId: string,
  body: ReturnPreviewRequest,
  signal: AbortSignal
) {
  return api.data(
    { locale, path: `${orderPath(orderId)}/preview`, method: 'POST', body, auth: 'user', signal },
    ReturnPreview
  );
}

/**
 * Asks the store to take the lines back. One `idempotencyKey` per request: a
 * retry with the same key answers the same returns, never new ones.
 */
export function createReturn(
  locale: string,
  orderId: string,
  body: CreateReturnRequest,
  idempotencyKey: string
) {
  return api.data(
    { locale, path: orderPath(orderId), method: 'POST', body, auth: 'user', idempotencyKey },
    CreatedReturns
  );
}

/** A page of the shopper's returns, newest first. */
export function getMyReturns(locale: string, query: ShopperReturnListQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/me/returns', query, auth: 'user', signal }, ShopperReturnList);
}

/** One of the shopper's returns. Another shopper's answers 404. */
export function getMyReturn(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `/me/returns/${encodeURIComponent(id)}`, auth: 'user', signal },
    ShopperReturn
  );
}
