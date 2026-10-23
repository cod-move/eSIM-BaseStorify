import { LIST_MAX_LIMIT } from '@/contracts/mobile/shop/v1';

import { resetMockServer } from '../mocks/server';
import { call, signIn } from './mock-helpers';

beforeEach(resetMockServer);

describe('the page size of a list', () => {
  it('is refused, as the store refuses it, when it is more than the contract allows', async () => {
    const { headers } = await signIn();
    const { response, body } = await call(
      `/chat/conversations/cnv_4/messages?limit=${LIST_MAX_LIMIT + 1}`,
      { headers }
    );

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(body.errors).toHaveProperty('limit');
  });

  it('is accepted up to the contract’s most', async () => {
    const { headers } = await signIn();
    const { response } = await call(`/chat/conversations/cnv_4/messages?limit=${LIST_MAX_LIMIT}`, {
      headers,
    });

    expect(response.status).toBe(200);
  });
});
