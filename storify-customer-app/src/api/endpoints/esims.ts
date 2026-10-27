/** Endpoints: the shopper's eSIMs (the eSIM module, APP-03/04). */
import {
  EsimDestinationDetail,
  EsimDestinationList,
  EsimDetail,
  EsimList,
  EsimTopupQuote,
  EsimTopups,
} from '@/contracts/mobile/shop/v1/esim';

import { api } from '../api';

/** The shopper's eSIMs, newest first. */
export function getEsims(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/esims', auth: 'user', signal }, EsimList);
}

/** One of the shopper's eSIMs, with how to install it. Another shopper's answers 404. */
export function getEsim(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `/me/esims/${encodeURIComponent(id)}`, auth: 'user', signal },
    EsimDetail
  );
}

/** Fresh usage from the supplier; within a minute of the last ask, what is stored. */
export function refreshEsim(locale: string, id: string) {
  return api.data(
    {
      locale,
      path: `/me/esims/${encodeURIComponent(id)}/refresh`,
      method: 'POST',
      auth: 'user',
      body: {},
    },
    EsimDetail
  );
}

/** Every destination on sale: countries, regions, global plans. The same for everybody. */
export function getEsimDestinations(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/esim/destinations', signal }, EsimDestinationList);
}

/** One destination with its plans. `scope` is `local` for a country, `multi` for a region or global. */
export function getEsimDestination(
  locale: string,
  scope: 'local' | 'multi',
  slug: string,
  signal: AbortSignal
) {
  return api.data(
    {
      locale,
      path: `/esim/destinations/${scope}/${encodeURIComponent(slug)}`,
      signal,
    },
    EsimDestinationDetail
  );
}

/** The top-ups this eSIM can take now, priced. */
export function getEsimTopups(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `/me/esims/${encodeURIComponent(id)}/topups`, auth: 'user', signal },
    EsimTopups
  );
}

/** Fixes one top-up for the cart: the answer is the cart line to send as it is. */
export function quoteEsimTopup(locale: string, id: string, topupPlanId: string) {
  return api.data(
    {
      locale,
      path: `/me/esims/${encodeURIComponent(id)}/topups/quote`,
      method: 'POST',
      auth: 'user',
      body: { topupPlanId },
    },
    EsimTopupQuote
  );
}
