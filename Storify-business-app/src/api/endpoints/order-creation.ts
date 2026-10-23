import {
  ManualOrderFormOptions,
  ManualOrderQuote,
  ManualOrderCreateResult,
  OrderContactCreateResult,
  OrderCustomerSelectors,
  OrderProductSelectors,
  type ManualOrderCreateRequest,
  type ManualOrderDraftRequest,
  type OrderContactCreateRequest,
  type OrderCustomerSelectorQuery,
  type OrderProductSelectorQuery,
} from '@/contracts/mobile/biz/v1';
import { api } from '../api';
import type { WorkspaceScope } from '../scope';

export const getOrderCreationOptions = (scope: WorkspaceScope, signal?: AbortSignal) =>
  api.data({ ...scope, path: '/orders/creation/options', signal }, ManualOrderFormOptions);
export const getOrderCreationProducts = (
  scope: WorkspaceScope,
  query: OrderProductSelectorQuery,
  signal?: AbortSignal
) =>
  api.data({ ...scope, path: '/orders/creation/products', query, signal }, OrderProductSelectors);
export const getOrderCreationCustomers = (
  scope: WorkspaceScope,
  query: OrderCustomerSelectorQuery,
  signal?: AbortSignal
) =>
  api.data({ ...scope, path: '/orders/creation/customers', query, signal }, OrderCustomerSelectors);
export const quoteOrder = (
  scope: WorkspaceScope,
  body: ManualOrderDraftRequest,
  signal?: AbortSignal
) =>
  api.data(
    { ...scope, path: '/orders/creation/quote', method: 'POST', body, signal },
    ManualOrderQuote
  );
export const createOrder = (
  scope: WorkspaceScope,
  body: ManualOrderCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal
) =>
  api.data(
    { ...scope, path: '/orders/creation', method: 'POST', body, idempotencyKey, signal },
    ManualOrderCreateResult
  );
export const createOrderContact = (
  scope: WorkspaceScope,
  body: OrderContactCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal
) =>
  api.data(
    { ...scope, path: '/orders/creation/contacts', method: 'POST', body, idempotencyKey, signal },
    OrderContactCreateResult
  );
