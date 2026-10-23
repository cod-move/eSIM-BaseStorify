import {
  AccountDeleted,
  Me,
  MeProduct,
  PasswordChange,
  WishlistChange,
} from '@/contracts/mobile/shop/v1';

import { MOCK_PASSWORD } from '../mocks/fixtures/auth';
import { mockFetch, resetMockServer } from '../mocks/server';
import { ORIGIN, call, dataOf, signIn } from './mock-helpers';

beforeEach(resetMockServer);

describe('account', () => {
  it('keeps the signed-in endpoints closed to a guest', async () => {
    const { response, body } = await call('/me');
    expect(response.status).toBe(401);
    expect(body).toMatchObject({ code: 'AUTHENTICATION_ERROR' });
  });

  it('signs in, answers the signed-in endpoints, and signs out', async () => {
    const { response, headers } = await signIn();
    expect(response.status).toBe(200);

    const me = await dataOf(Me, '/me', { headers });
    expect(me.email).toBe('nadia@example.com');

    const productId = 'prod_leather-card-holder';
    expect(await dataOf(MeProduct, `/me/products/${productId}`, { headers })).toMatchObject({
      inWishlist: false,
    });
    await dataOf(WishlistChange, `/wishlist/${productId}`, { method: 'PUT', headers });
    expect(await dataOf(MeProduct, `/me/products/${productId}`, { headers })).toMatchObject({
      inWishlist: true,
    });

    await mockFetch(`${ORIGIN}/api/auth/sign-out`, { method: 'POST', headers });
    expect((await call('/me', { headers })).response.status).toBe(401);
  });

  it('changes only the profile fields sent, and clears one sent as null', async () => {
    const { headers } = await signIn();
    const before = await dataOf(Me, '/me', { headers });
    expect(before).toMatchObject({ phone: expect.any(String), gender: 'female' });

    const after = await dataOf(Me, '/me', {
      method: 'PATCH',
      headers,
      body: { name: 'Nadia Rahman', phone: null, birthday: '1990-01-31' },
    });
    expect(after).toMatchObject({ name: 'Nadia Rahman', birthday: '1990-01-31', gender: 'female' });
    expect(after.phone).toBeUndefined();
    expect(await dataOf(Me, '/me', { headers })).toEqual(after);
  });

  it('refuses a login email change and a birthday not in the contract shape', async () => {
    const { headers } = await signIn();
    const email = await call('/me', { method: 'PATCH', headers, body: { email: 'a@b.co' } });
    expect(email.response.status).toBe(403);
    expect(email.body).toMatchObject({ reason: 'EMAIL_CHANGE_NOT_ALLOWED' });

    const birthday = await call('/me', {
      method: 'PATCH',
      headers,
      body: { birthday: '31/01/1990' },
    });
    expect(birthday.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('changes the password only with the current one, keeping this session', async () => {
    const { headers } = await signIn();
    const other = await signIn();
    const send = (body: object) => call('/me/password', { method: 'POST', headers, body });

    expect(
      (await send({ currentPassword: 'wrong', newPassword: 'New-pass-123' })).body
    ).toMatchObject({ reason: 'CURRENT_PASSWORD_INCORRECT' });
    expect(
      (await send({ currentPassword: MOCK_PASSWORD, newPassword: MOCK_PASSWORD })).body
    ).toMatchObject({ reason: 'SAME_PASSWORD' });

    const done = await dataOf(PasswordChange, '/me/password', {
      method: 'POST',
      headers,
      body: { currentPassword: MOCK_PASSWORD, newPassword: 'New-pass-123' },
    });
    expect(done.mode).toBe('CHANGED');
    expect((await call('/me', { headers })).response.status).toBe(200);
    expect((await call('/me', { headers: other.headers })).response.status).toBe(401);
  });

  it('deletes the account with its password and ends every session', async () => {
    const { headers } = await signIn();
    const wrong = await call('/me', { method: 'DELETE', headers, body: { password: 'nope' } });
    expect(wrong.body).toMatchObject({ reason: 'PASSWORD_INCORRECT' });

    const deleted = await dataOf(AccountDeleted, '/me', {
      method: 'DELETE',
      headers,
      body: { password: MOCK_PASSWORD },
    });
    expect(deleted.deleted).toBe(true);
    expect((await call('/me', { headers })).response.status).toBe(401);
  });
});
