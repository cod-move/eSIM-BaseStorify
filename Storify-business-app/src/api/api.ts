import { Platform } from 'react-native';

import { env } from '@/config/env';
import { getSessionCookie, recheckSession } from '@/lib/auth-client';
import { appInfo, getInstallId } from '@/lib/device';

import { createApiClient } from './client';
import { useGate } from './gate';
import { queryClient } from './query-client';
import { ME_QUERIES } from './query-keys';
import { transport } from './transport';

/** The app's one API client, wired to the device. Endpoint functions call it; screens do not. */
export const api = createApiClient({
  baseUrl: env.apiUrl,
  fetch: transport,
  appInfo,
  getInstallId,
  getCookie: getSessionCookie,
  browserCookies: Platform.OS === 'web',
  onUpdateRequired: (details) => useGate.getState().requireUpdate(details),
  onUnauthorized: recheckSession,
  // A role, a permission or a seller's status changed by somebody else: GET /me
  // says what the operator may do now, and the workspace follows from it.
  onAccessRefused: () => void queryClient.invalidateQueries({ queryKey: ME_QUERIES }),
});
