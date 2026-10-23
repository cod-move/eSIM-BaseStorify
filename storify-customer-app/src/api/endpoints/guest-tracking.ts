/** Endpoints: tracking a guest's order. */
import { env } from '@/config/env';
import { API_BASE_PATH, OrderDetail, type TrackOrderRequest } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import { downloadBinary } from '../transport';

import { appHeaders } from './orders';

/**
 * An order placed without an account, found by its number and the email or phone
 * it was placed with. No session is sent. A wrong number and a wrong contact are
 * the same 404; the same address may look an order up 5 times per 15 minutes,
 * then 429.
 */
export function trackOrder(locale: string, request: TrackOrderRequest) {
  return api.data(
    { locale, path: '/orders/track', method: 'POST', auth: 'none', body: request },
    OrderDetail
  );
}

/** The invoice's PDF of a guest's order, found as `trackOrder` finds it. No session is sent. */
export function getGuestInvoice(locale: string, request: TrackOrderRequest, signal?: AbortSignal) {
  return downloadBinary(
    `${env.apiUrl}${API_BASE_PATH}/${encodeURIComponent(locale)}/orders/track/invoice`,
    { headers: appHeaders(), accept: 'application/pdf', body: request, signal }
  );
}
