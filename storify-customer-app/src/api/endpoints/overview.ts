/** Endpoints: the signed-in shopper's overview. */
import { MeOverview } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** The shopper's badges and saved product ids. Send the last ETag back to be told "unchanged". */
export function getMeOverview(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/me/overview', auth: 'user', etag, signal }, MeOverview);
}
