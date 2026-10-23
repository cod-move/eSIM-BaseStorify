/** Endpoints: the shopper's orders. */
import { Platform } from 'react-native';

import { env } from '@/config/env';
import {
  API_BASE_PATH,
  OrderCancelResult,
  OrderDetail,
  OrderList,
  type OrderListQuery,
  REQUEST_HEADERS,
} from '@/contracts/mobile/shop/v1';
import { getSessionCookie } from '@/lib/auth-client';
import { appInfo, getInstallId } from '@/lib/device';

import { api } from '../api';
import { downloadBinary } from '../transport';

/** The app's own headers, sent by hand on a call that does not go through the API client. */
export function appHeaders(): Record<string, string> {
  return {
    [REQUEST_HEADERS.appVersion]: appInfo.version,
    [REQUEST_HEADERS.appBuild]: appInfo.build,
    [REQUEST_HEADERS.appPlatform]: appInfo.platform,
    [REQUEST_HEADERS.installId]: getInstallId(),
  };
}

/**
 * The invoice's PDF, as bytes. It is not JSON, so it does not go through the
 * API client: the same headers and the shopper's session are sent by hand
 * (in the browser, its cookie).
 */
export function getInvoice(locale: string, id: string, signal?: AbortSignal) {
  const headers = appHeaders();
  const cookie = getSessionCookie();
  if (cookie) headers.Cookie = cookie;

  return downloadBinary(
    `${env.apiUrl}${API_BASE_PATH}/${encodeURIComponent(locale)}/orders/${encodeURIComponent(id)}/invoice`,
    {
      headers,
      accept: 'application/pdf',
      credentials: Platform.OS === 'web' ? 'same-origin' : 'omit',
      signal,
    }
  );
}

/** A page of the shopper's orders, newest first. */
export function getOrders(locale: string, query: OrderListQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/orders', query, auth: 'user', signal }, OrderList);
}

/** One of the shopper's orders. Another shopper's answers 404. */
export function getOrder(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `/orders/${encodeURIComponent(id)}`, auth: 'user', signal },
    OrderDetail
  );
}

/**
 * Calls the order off. The store decides whether it may (`canCancel` says what
 * it would answer) and refuses with 409 when it may not.
 */
export function cancelOrder(locale: string, id: string) {
  return api.data(
    { locale, path: `/orders/${encodeURIComponent(id)}/cancel`, method: 'POST', auth: 'user' },
    OrderCancelResult
  );
}
