import { Platform } from 'react-native';
import type * as z from 'zod';

import { env } from '@/config/env';
import { API_BASE_PATH, REQUEST_HEADERS } from '@/contracts/mobile/shop/v1';
import { useLocaleStore } from '@/i18n/locale-store';
import { getSessionCookie, refreshSession } from '@/lib/auth-client';
import { appInfo, getInstallId } from '@/lib/device';
import { secureStorage } from '@/lib/secure-storage';
import { SECURE_KEYS } from '@/lib/storage-keys';

import { createApiClient } from './client';
import { ApiError } from './errors';
import { useGate } from './gate';
import { postFile, transport, type FormFile } from './transport';

/**
 * The session cookies the API refused since the last re-check. The re-check
 * renews the session only when the phone ends up with a cookie outside this
 * set: a request refused once more after a renewal signs the shopper out.
 */
const refusedCookies = new Set<string>();

const noteRefusals: typeof fetch = async (input, init) => {
  const response = await transport(input, init);
  if (response.status === 401) {
    const cookie = new Headers(init?.headers).get('Cookie');
    if (cookie) refusedCookies.add(cookie);
  }
  return response;
};

async function recheckSession(): Promise<void> {
  try {
    await refreshSession(refusedCookies);
  } finally {
    refusedCookies.clear();
  }
}

/** The app's one API client, wired to the device. Endpoint functions call it; screens do not. */
export const api = createApiClient({
  baseUrl: env.apiUrl,
  fetch: noteRefusals,
  appInfo,
  getInstallId,
  getCookie: getSessionCookie,
  browserCookies: Platform.OS === 'web',
  getCartToken: () => secureStorage.getItem(SECURE_KEYS.cartToken),
  setCartToken: (token) => secureStorage.setItem(SECURE_KEYS.cartToken, token),
  onUpdateRequired: () => useGate.getState().requireUpdate(),
  onMaintenance: (details) => useGate.getState().setMaintenance(details),
  onUnauthorized: recheckSession,
  onLocaleNotAvailable: (details) => useLocaleStore.getState().adopt(details.defaultLocale),
});

/**
 * Sends one file to the store as `multipart/form-data` (a review's photo) and
 * returns the answer, checked against `schema`. The API client speaks JSON, so
 * the app's headers and the shopper's session are put on by hand, as the
 * client puts them on every call.
 */
export async function sendFile<T>(
  req: {
    locale: string;
    path: string;
    field: string;
    file: FormFile;
    /** Text sent beside the file: a message, its id. */
    fields?: Record<string, string>;
    signal?: AbortSignal;
  },
  schema: z.ZodType<T>
): Promise<T> {
  const headers: Record<string, string> = {
    [REQUEST_HEADERS.appVersion]: appInfo.version,
    [REQUEST_HEADERS.appBuild]: appInfo.build,
    [REQUEST_HEADERS.appPlatform]: appInfo.platform,
    [REQUEST_HEADERS.installId]: getInstallId(),
  };
  const cookie = getSessionCookie();
  if (cookie) headers.Cookie = cookie;

  const data = await postFile(
    `${env.apiUrl}${API_BASE_PATH}/${encodeURIComponent(req.locale)}${req.path}`,
    {
      headers,
      field: req.field,
      file: req.file,
      fields: req.fields,
      credentials: Platform.OS === 'web' ? 'same-origin' : 'omit',
      signal: req.signal,
    }
  );
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(200, 'INVALID_RESPONSE', '');
  return parsed.data;
}

/** Forget the guest cart: its lines now belong to the account's cart. */
export function clearCartToken(): void {
  secureStorage.removeItem(SECURE_KEYS.cartToken);
}
