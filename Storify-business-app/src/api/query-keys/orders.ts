import type {
  OrderListQuery,
  OrderCustomerSelectorQuery,
  OrderProductSelectorQuery,
} from '@/contracts/mobile/biz/v1';

import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

type OrderFilter = Omit<OrderListQuery, 'cursor' | 'limit'>;

export const ordersKeys = {
  /** A small, single-page read; separate from the infinite Orders list cache. */
  homeOrders: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'orders'), 'list', 'home-preview', scope?.locale] as const,
  orderCreationProductLists: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'orders'), 'creation', 'products'] as const,
  orderCreationCustomerLists: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'orders'), 'creation', 'customers'] as const,
  orderCreationOptions: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'orders'), 'creation', 'options', scope?.locale] as const,
  orderCreationProducts: (
    scope: WorkspaceScope | null,
    filter: Omit<OrderProductSelectorQuery, 'cursor'>
  ) => [...inWorkspace(scope, 'orders'), 'creation', 'products', scope?.locale, filter] as const,
  orderCreationCustomers: (
    scope: WorkspaceScope | null,
    filter: Omit<OrderCustomerSelectorQuery, 'cursor'>
  ) => [...inWorkspace(scope, 'orders'), 'creation', 'customers', scope?.locale, filter] as const,
  /** Every order list of the workspace, whatever the tab, search and language. */
  orderLists: (scope: WorkspaceScope | null) => [...inWorkspace(scope, 'orders'), 'list'] as const,
  orderList: (scope: WorkspaceScope | null, filter: OrderFilter) =>
    [...inWorkspace(scope, 'orders'), 'list', scope?.locale, filter] as const,
  order: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'orders'), 'detail', id, scope?.locale] as const,
};
