/** GET /config: the store's settings. No session needed. */
import { config } from '../fixtures/config';
import type { MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/config', access: 'public', handle: (ctx) => config(ctx.locale) },
];
