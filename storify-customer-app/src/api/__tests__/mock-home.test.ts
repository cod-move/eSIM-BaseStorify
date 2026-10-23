import { HOME_BLOCKS, Home } from '@/contracts/mobile/shop/v1';

import { resetMockServer } from '../mocks/server';
import { call, dataOf } from './mock-helpers';

beforeEach(resetMockServer);

describe('home', () => {
  it('sends home blocks the contract describes, and one it does not', async () => {
    const home = await dataOf(Home, '/home');
    const known = home.blocks.filter((block) => block.type in HOME_BLOCKS);

    expect(known.length).toBeGreaterThan(0);
    expect(known.length).toBeLessThan(home.blocks.length);
    for (const block of known) {
      HOME_BLOCKS[block.type as keyof typeof HOME_BLOCKS].parse(block);
    }
  });

  it('answers "not modified" to a request that carries the current validator', async () => {
    const first = await call('/home');
    const etag = first.response.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await call('/home', { headers: { 'If-None-Match': etag ?? '' } });
    expect(second.response.status).toBe(304);
    expect(second.body).toBeUndefined();
  });
});
