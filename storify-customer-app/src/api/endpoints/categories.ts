import { CategoryTree } from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

export function getCategories(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/categories', etag, signal }, CategoryTree);
}
