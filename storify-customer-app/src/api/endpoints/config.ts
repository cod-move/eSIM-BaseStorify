import { Config } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

export function getConfig(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/config', etag, signal }, Config);
}
