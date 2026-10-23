import { Home } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

export function getHome(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/home', etag, signal }, Home);
}
