/** The category tree. */
import { categoryTree } from '../fixtures/categories';
import type { MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/categories', handle: () => ({ items: categoryTree() }) },
];
