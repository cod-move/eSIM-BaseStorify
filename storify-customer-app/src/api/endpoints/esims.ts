/** Endpoints: the shopper's eSIMs (the eSIM module, APP-03/04). */
import { EsimDetail, EsimList } from '@/contracts/mobile/shop/v1/esim';

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
