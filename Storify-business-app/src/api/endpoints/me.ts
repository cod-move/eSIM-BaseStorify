/** Endpoints: the signed-in operator. */
import { Me } from '@/contracts/mobile/biz/v1';

import { api } from '../api';

/**
 * GET /me: who they are, and what they may do in each workspace. Asked without
 * `X-Workspace`: it lists every workspace, and the app picks one from it.
 */
export function getMe(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me', signal }, Me);
}

/**
 * PUT /me/picture: a photo becomes their profile picture. The photo's bytes,
 * as multipart; the transport supplies the boundary. Answers the whole `Me`.
 */
export function updateMyPicture(locale: string, file: Blob, filename: string) {
  const multipartBody = new FormData();
  multipartBody.append('file', file, filename);
  return api.data({ locale, path: '/me/picture', method: 'PUT', multipartBody }, Me);
}

/** DELETE /me/picture: no profile picture. Answers the whole `Me`. */
export function removeMyPicture(locale: string) {
  return api.data({ locale, path: '/me/picture', method: 'DELETE' }, Me);
}
