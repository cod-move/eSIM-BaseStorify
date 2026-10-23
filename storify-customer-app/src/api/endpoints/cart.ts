import { Cart, type SetCartLineRequest, VendorDetail } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

// Every cart request is `auth: 'optional'` and `cart: true`: a guest is found
// by the cart token, a signed-in shopper by the session.

export function getCart(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/cart', auth: 'optional', cart: true, etag, signal }, Cart);
}

/** Sets the quantity of one product in the cart. It does not add to what is there. */
export function setCartLine(locale: string, line: SetCartLineRequest) {
  return api.data(
    { locale, path: '/cart/lines', method: 'PUT', body: line, auth: 'optional', cart: true },
    Cart
  );
}

export function removeCartLine(locale: string, lineKey: string) {
  return api.data(
    {
      locale,
      path: `/cart/lines/${encodeURIComponent(lineKey)}`,
      method: 'DELETE',
      auth: 'optional',
      cart: true,
    },
    Cart
  );
}

/** After sign-in: moves the guest cart's lines into the account's cart. */
export function mergeCart(locale: string) {
  return api.data({ locale, path: '/cart/merge', method: 'POST', auth: 'user', cart: true }, Cart);
}

/**
 * The seller of a group of cart lines: the logo, rating and units sold that a
 * cart line does not carry. Public, the same for every shopper.
 */
export function getCartVendor(locale: string, slug: string, signal?: AbortSignal) {
  return api.data({ locale, path: `/vendors/${encodeURIComponent(slug)}`, signal }, VendorDetail);
}
