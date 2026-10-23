/** The signed-in shopper's overview. */
import { overviewFor } from '../fixtures/overview';
import { requireUser, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/me/overview', handle: (ctx) => overviewFor(requireUser(ctx)) },
];
