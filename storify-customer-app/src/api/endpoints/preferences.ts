/** Endpoints: the shopper's preferences. Both answer the whole list. */
import { Preferences, type UpdatePreferencesRequest } from '@/contracts/mobile/shop/v1';

import { api } from '../api';

export function getPreferences(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/preferences', auth: 'user', signal }, Preferences);
}

/** Only the switches sent change. */
export function updatePreferences(locale: string, change: UpdatePreferencesRequest) {
  return api.data(
    { locale, path: '/me/preferences', method: 'PATCH', body: change, auth: 'user' },
    Preferences
  );
}
