import { API_BASE_PATH, Config, Me } from '@/contracts/mobile/biz/v1';

import { MOCK_TOTP_CODE, mockFetch, resetMockServer } from '../mocks/server';
import { ORIGIN, as, call, dataOf, refusalOf, signInAs } from './mock-helpers';

beforeEach(resetMockServer);

describe('the store and sign-in', () => {
  it('answers the store settings to anybody, in the language asked', async () => {
    const config = await dataOf(Config, '/config', { locale: 'bn' });
    expect(config.locale).toMatchObject({ current: 'bn', default: 'en' });
    expect(config.features.multiVendor).toBe(true);
  });

  it('refuses a language the store does not serve, naming the one it does', async () => {
    const body = await refusalOf(404, 'LOCALE_NOT_AVAILABLE', '/config', { locale: 'xx' });
    expect(body.details).toMatchObject({ defaultLocale: 'en' });
  });

  it("refuses a shopper's sign-in before any session exists", async () => {
    const { response, cookie } = await signInAs('shopper@example.com');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'BIZ_APP_OPERATORS_ONLY' });
    expect(cookie).toBe('');
  });

  it('counts wrong passwords and warns before the lock', async () => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await signInAs('admin@example.com', 'wrong');
    }
    const { response } = await signInAs('admin@example.com', 'wrong');
    expect(await response.json()).toMatchObject({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      attemptsRemaining: 2,
    });
  });

  it('asks an account with two-step verification for its code, then opens the session', async () => {
    const { response, cookie } = await signInAs('two-step@example.com');
    expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
    expect(cookie).toBe('better-auth.session_token=');

    const challenge = (response.headers.get('set-cookie') ?? '')
      .split(/,\s*/)
      .find((part) => part.startsWith('better-auth.two_factor='))
      ?.split(';')[0];
    const verified = await mockFetch(`${ORIGIN}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: { Cookie: challenge ?? '' },
      body: JSON.stringify({ code: MOCK_TOTP_CODE }),
    });
    const session = (verified.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    expect(verified.status).toBe(200);
    const me = await dataOf(Me, '/me', { headers: { Cookie: session } });
    expect(me).toMatchObject({ email: 'two-step@example.com', twoFactorEnabled: true });
  });
});

describe('GET /me', () => {
  it('needs a session', async () => {
    await refusalOf(401, 'AUTHENTICATION_ERROR', '/me');
  });

  it('describes each kind of operator in the shape of the contract', async () => {
    const admin = await dataOf(Me, '/me', { headers: await as('admin@example.com') });
    expect(admin).toMatchObject({ role: 'admin', isOwner: true, currentWorkspace: 'platform' });
    expect(admin.workspaces[0]?.capabilities).toContain('REVIEW_VENDOR_APPLICATIONS');

    const seller = await dataOf(Me, '/me', { headers: await as('seller@example.com') });
    expect(seller.workspaces[0]).toMatchObject({
      workspace: 'vendor',
      role: 'vendor',
      vendor: { name: 'Green Leaf Goods', status: 'approved', active: true },
    });
    expect(seller.workspaces[0]?.capabilities).toContain('VIEW_PAYOUTS');

    const unpaid = await dataOf(Me, '/me', { headers: await as('unpaid-seller@example.com') });
    expect(unpaid.workspaces[0]?.vendor).toMatchObject({
      status: 'payment_required',
      active: false,
    });
    expect(unpaid.workspaces[0]?.capabilities).not.toContain('VIEW_ORDERS');
  });

  it('lists two workspaces and names none current without X-Workspace', async () => {
    const headers = await as('both@example.com');
    const me = await dataOf(Me, '/me', { headers });
    expect(me.workspaces.map((access) => access.workspace)).toEqual(['platform', 'vendor']);
    expect(me.currentWorkspace).toBeUndefined();

    const inVendor = await dataOf(Me, '/me', { headers: { ...headers, 'X-Workspace': 'vendor' } });
    expect(inVendor.currentWorkspace).toBe('vendor');
  });

  it('answers somebody who can work nowhere with no workspace', async () => {
    const me = await dataOf(Me, '/me', { headers: await as('no-access@example.com') });
    expect(me.workspaces).toEqual([]);
  });
});

describe("PUT and DELETE /me/picture: the operator's picture", () => {
  /** A photo as the app sends it: multipart, the file in the field `file`. */
  async function putPicture(headers: Record<string, string>, type: string) {
    const form = new FormData();
    form.append('file', new Blob(['photo-bytes'], { type }), 'me.jpg');
    const response = await mockFetch(`${ORIGIN}${API_BASE_PATH}/en/me/picture`, {
      method: 'PUT',
      headers,
      body: form,
    });
    return { status: response.status, body: await response.json() };
  }

  it('takes a photo as the picture and answers GET /me, then removes it', async () => {
    const headers = await as('admin@example.com');
    const { status, body } = await putPicture(headers, 'image/jpeg');
    expect(status).toBe(200);
    const me = Me.parse(body.data);
    expect(me.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect((await dataOf(Me, '/me', { headers })).imageUrl).toBe(me.imageUrl);

    const removed = await dataOf(Me, '/me/picture', { method: 'DELETE', headers });
    expect(removed.imageUrl).toBeUndefined();
  });

  it('refuses a file that is not a photo, and a request with none', async () => {
    const headers = await as('staff@example.com');
    const { status, body } = await putPicture(headers, 'application/pdf');
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_ERROR', reason: 'UPLOAD_TYPE_NOT_ALLOWED' });

    const missing = await refusalOf(400, 'VALIDATION_ERROR', '/me/picture', {
      method: 'PUT',
      headers,
      body: {},
    });
    expect(missing.reason).toBe('UPLOAD_MISSING');
  });

  it('needs a session', async () => {
    await refusalOf(401, 'AUTHENTICATION_ERROR', '/me/picture', { method: 'DELETE' });
  });
});

describe('workspaces and capabilities', () => {
  it('asks a person with two workspaces to say which', async () => {
    const body = await refusalOf(400, 'VALIDATION_ERROR', '/orders', {
      headers: await as('both@example.com'),
    });
    expect(body.errors).toHaveProperty('X-Workspace');
  });

  it('refuses a workspace that is not theirs, naming theirs', async () => {
    const body = await refusalOf(403, 'WORKSPACE_NOT_AVAILABLE', '/orders', {
      headers: await as('seller@example.com', 'platform'),
    });
    expect(body.details).toEqual({ workspaces: ['vendor'] });
  });

  it('refuses everything of a workspace to somebody who can work nowhere', async () => {
    const body = await refusalOf(403, 'WORKSPACE_NOT_AVAILABLE', '/home', {
      headers: await as('no-access@example.com'),
    });
    expect(body.details).toEqual({ workspaces: [] });
  });

  it("says why a seller's shop that is not open is refused", async () => {
    const body = await refusalOf(403, 'VENDOR_NOT_ACTIVE', '/orders', {
      headers: await as('unpaid-seller@example.com'),
    });
    expect(body.details).toEqual({ status: 'payment_required' });
    // The catalogue stays open while the shop awaits its first payment.
    expect(
      (await call('/products', { headers: await as('unpaid-seller@example.com') })).response.status
    ).toBe(200);
  });

  it('refuses what a role may not do, and what belongs to the other kind of workspace', async () => {
    await refusalOf(403, 'AUTHORIZATION_ERROR', '/products/prod_vase', {
      method: 'PATCH',
      headers: { ...(await as('staff@example.com')), 'If-Match': '1' },
      body: { status: 'draft' },
    });
    await refusalOf(403, 'WORKSPACE_NOT_AVAILABLE', '/payouts/summary', {
      headers: await as('admin@example.com'),
    });
    await refusalOf(403, 'WORKSPACE_NOT_AVAILABLE', '/vendor-applications', {
      headers: await as('seller@example.com'),
    });
  });
});
