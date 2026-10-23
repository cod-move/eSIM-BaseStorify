/** The search start page: its public half for everybody, the "For you" shelf for a shopper. */
import { meSearchStart, searchStart } from '../fixtures/search-start';
import { requireUser, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/search/start', handle: () => searchStart() },
  {
    method: 'GET',
    path: '/me/search/start',
    handle: (ctx) => meSearchStart(requireUser(ctx), ctx.locale),
  },
];
