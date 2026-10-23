import {
  AccountDeleted,
  Me,
  MeProduct,
  PasswordChange,
  WishlistChange,
  type ChangePasswordRequest,
  type DeleteAccountRequest,
  type UpdateMeRequest,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';

export function getMe(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me', auth: 'user', signal }, Me);
}

/** Changes the fields sent; `null` clears one. Answers the whole profile. */
export function updateMe(locale: string, body: UpdateMeRequest) {
  return api.data({ locale, path: '/me', method: 'PATCH', auth: 'user', body }, Me);
}

/** Every other device is signed out; this one stays signed in. */
export function changePassword(locale: string, body: ChangePasswordRequest) {
  return api.data(
    { locale, path: '/me/password', method: 'POST', auth: 'user', body },
    PasswordChange
  );
}

/** Deletes the account for good. The app then forgets the session. */
export function deleteAccount(locale: string, body: DeleteAccountRequest) {
  return api.data({ locale, path: '/me', method: 'DELETE', auth: 'user', body }, AccountDeleted);
}

/** The shopper's own half of the product page: is it in the wishlist, may they review it. */
export function getMeProduct(locale: string, productId: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `/me/products/${encodeURIComponent(productId)}`, auth: 'user', signal },
    MeProduct
  );
}

export function setWishlisted(locale: string, productId: string, wishlisted: boolean) {
  return api.data(
    {
      locale,
      path: `/wishlist/${encodeURIComponent(productId)}`,
      method: wishlisted ? 'PUT' : 'DELETE',
      auth: 'user',
    },
    WishlistChange
  );
}
