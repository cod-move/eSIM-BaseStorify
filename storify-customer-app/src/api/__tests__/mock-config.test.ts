import { Config } from '@/contracts/mobile/shop/v1';

import { resetMockServer } from '../mocks/server';
import { call, dataOf } from './mock-helpers';

beforeEach(resetMockServer);

describe('config', () => {
  it('answers /config in the language of the path', async () => {
    const config = await dataOf(Config, '/config', { locale: 'ar' });
    expect(config.locale.current).toBe('ar');
    expect(config.locale.languages.map((language) => language.code)).toContain('ar');
  });

  it('gives the store a square icon beside its wide logo', async () => {
    const { store } = await dataOf(Config, '/config');
    expect(store.icon?.thumb).toBeTruthy();
    expect(store.icon?.thumb).not.toBe(store.logo?.thumb);
  });

  it('answers 404 for a language the store does not offer', async () => {
    const { response, body } = await call('/config', { locale: 'ja' });
    expect(response.status).toBe(404);
    expect(body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
