/** Endpoints: orders, and the workflow's next step. */
import {
  OrderActionResult,
  OrderDetail,
  OrderList,
  type OrderActionRequest,
  type OrderListQuery,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';
import type { WorkspaceScope } from '../scope';

/** GET /orders: a page, newest first. For a seller each row is their consignment. */
export function getOrders(
  { locale, workspace }: WorkspaceScope,
  query: OrderListQuery,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/orders', query, etag, signal }, OrderList);
}

/** GET /orders/{id}. One out of the operator's reach answers 404. */
export function getOrder(
  { locale, workspace }: WorkspaceScope,
  id: string,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: `/orders/${encodeURIComponent(id)}`, etag, signal },
    OrderDetail
  );
}

/** POST /orders/{id}/actions: the step, made once per key. Answers the order after it. */
export function postOrderAction(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: OrderActionRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/orders/${encodeURIComponent(id)}/actions`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    OrderActionResult
  );
}
