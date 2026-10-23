/** The home screen's blocks. */
import { homeBlocks } from '../fixtures/home';
import type { MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/home', handle: ({ locale }) => ({ blocks: homeBlocks(locale) }) },
];
