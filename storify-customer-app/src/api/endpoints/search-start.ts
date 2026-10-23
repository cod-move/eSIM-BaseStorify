import { MeSearchStart, SearchStart } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** The search start page's trending terms and popular categories, the same for everybody. */
export function getSearchStart(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/search/start', etag, signal }, SearchStart);
}

/** The signed-in shopper's "For you" shelf. A guest never asks. */
export function getMeSearchStart(locale: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: '/me/search/start', auth: 'user', etag, signal },
    MeSearchStart
  );
}
