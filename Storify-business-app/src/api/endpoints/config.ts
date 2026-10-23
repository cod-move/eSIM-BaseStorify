/** Endpoints: the store's settings, the one answer that needs no session. */
import { Config } from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** GET /config. The same for everybody, so it is asked without the session. */
export function getConfig(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/config', auth: 'none', etag, signal }, Config);
}
