/** Endpoints: the eSIM payment page's methods, listed and (for crypto) paid in the app itself (APP-09). */
import {
  EsimCryptoPayment,
  EsimPayChoices,
  EsimSheetPayment,
  type EsimCryptoChooseRequest,
} from '@/contracts/mobile/shop/v1/esim';

import { api } from '../api';

const base = (checkoutRef: string) => `/esim/pay/${encodeURIComponent(checkoutRef)}`;

/** The methods the checkout can be paid with; `native` ones are paid in the app's own screen. */
export function getEsimPayChoices(locale: string, checkoutRef: string, signal?: AbortSignal) {
  return api.data({ locale, path: base(checkoutRef), auth: 'optional', signal }, EsimPayChoices);
}

/** Starts (or takes up again) a crypto payment with this method. */
export function startEsimCrypto(locale: string, checkoutRef: string, method: string) {
  return api.data(
    {
      locale,
      path: `${base(checkoutRef)}/crypto`,
      method: 'POST',
      body: { method },
      auth: 'optional',
    },
    EsimCryptoPayment
  );
}

/** The crypto payment as it stands (the gateway is asked each time). */
export function getEsimCrypto(
  locale: string,
  checkoutRef: string,
  payment: string,
  signal?: AbortSignal
) {
  return api.data(
    { locale, path: `${base(checkoutRef)}/crypto`, query: { payment }, auth: 'optional', signal },
    EsimCryptoPayment
  );
}

/** Pays in this coin on this network: the answer carries the address. */
export function chooseEsimCrypto(
  locale: string,
  checkoutRef: string,
  body: EsimCryptoChooseRequest
) {
  return api.data(
    {
      locale,
      path: `${base(checkoutRef)}/crypto/choose`,
      method: 'POST',
      body,
      auth: 'optional',
    },
    EsimCryptoPayment
  );
}

/** Starts a try paid in the gateway's native sheet (Stripe's Payment Sheet). */
export function startEsimSheet(locale: string, checkoutRef: string, method: string) {
  return api.data(
    {
      locale,
      path: `${base(checkoutRef)}/sheet`,
      method: 'POST',
      body: { method },
      auth: 'optional',
    },
    EsimSheetPayment
  );
}
