import type { OrderListQuery } from '@/contracts/mobile/shop/v1';

export const ordersKeys = {
  /** The order history, one list per filter. */
  orderList: (locale: string, query: Omit<OrderListQuery, 'cursor' | 'limit'>) =>
    ['private', locale, 'orders', 'list', query] as const,
  order: (locale: string, id: string) => ['private', locale, 'orders', 'detail', id] as const,
};
