import { createApiClient, type ApiClientDeps } from '../client';
import { ApiError, isRetryable, NetworkError } from '../errors';

type Call = { url: string; init: RequestInit };

/** A client whose network is a list of canned answers, with every call recorded. */
function setup(answers: (Response | Error)[], overrides: Partial<ApiClientDeps> = {}) {
  const calls: Call[] = [];
  const deps: ApiClientDeps = {
    baseUrl: 'https://shop.example.com',
    fetch: async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      const answer = answers.shift();
      if (!answer) throw new Error('No answer prepared for this request');
      if (answer instanceof Error) throw answer;
      return answer;
    },
    appInfo: { version: '1.4.0', build: '27', platform: 'ios' },
    getInstallId: () => 'install-1',
    getCookie: () => 'better-auth.session_token=abc',
    onUpdateRequired: jest.fn(),
    onUnauthorized: jest.fn(),
    onAccessRefused: jest.fn(),
    ...overrides,
  };
  return { api: createApiClient(deps), deps, calls };
}

const ok = (data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200, headers });

const refused = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ success: false, message: '', ...body }), { status });

const headersOf = (call: Call | undefined) => call?.init.headers as Record<string, string>;

describe('the request', () => {
  it('puts the locale in the business path and sorts the query', async () => {
    const { api, calls } = setup([ok({})]);

    await api.request({
      locale: 'bn',
      path: '/orders',
      query: { tab: 'needs_action', search: undefined, limit: 20, unreadOnly: true, cursor: '' },
    });

    expect(calls[0]?.url).toBe(
      'https://shop.example.com/api/mobile/biz/v1/bn/orders?limit=20&tab=needs_action&unreadOnly=true'
    );
  });

  it("says which app is asking, and carries the operator's session by hand", async () => {
    const { api, calls } = setup([ok({})]);

    await api.request({ locale: 'en', path: '/me' });

    expect(headersOf(calls[0])).toMatchObject({
      'X-App-Version': '1.4.0',
      'X-App-Build': '27',
      'X-App-Platform': 'ios',
      'X-Install-Id': 'install-1',
      Cookie: 'better-auth.session_token=abc',
    });
    expect(calls[0]?.init.credentials).toBe('omit');
  });

  it('never sends the session with the one answer that is the same for everybody', async () => {
    const { api, calls } = setup([ok({})]);

    await api.request({ locale: 'en', path: '/config', auth: 'none' });

    expect(headersOf(calls[0])).not.toHaveProperty('Cookie');
  });

  it('names the workspace, the version a change is made against, and the tap', async () => {
    const { api, calls } = setup([ok({}), ok({})]);

    await api.request({
      locale: 'en',
      path: '/products/p1',
      method: 'PATCH',
      body: { price: 12.5 },
      workspace: 'vendor',
      ifMatch: '1712345678901',
    });
    await api.request({
      locale: 'en',
      path: '/orders/o1/actions',
      method: 'POST',
      body: { action: 'cancel' },
      workspace: 'platform',
      idempotencyKey: 'key-1',
    });

    expect(headersOf(calls[0])).toMatchObject({
      'X-Workspace': 'vendor',
      'If-Match': '1712345678901',
      'Content-Type': 'application/json',
    });
    expect(calls[0]?.init.body).toBe('{"price":12.5}');
    expect(headersOf(calls[1])).toMatchObject({
      'X-Workspace': 'platform',
      'Idempotency-Key': 'key-1',
    });
  });

  it('leaves the workspace out of an account endpoint', async () => {
    const { api, calls } = setup([ok({})]);

    await api.request({ locale: 'en', path: '/notifications' });

    expect(headersOf(calls[0])).not.toHaveProperty('X-Workspace');
  });

  it('passes multipart files intact and lets the transport set the boundary', async () => {
    const { api, calls } = setup([ok({ id: 'upload-1' })]);
    const multipartBody = new FormData();
    multipartBody.append('purpose', 'product_media');
    multipartBody.append('target', JSON.stringify({ kind: 'product', id: 'p1' }));
    const file = new Blob(['photo-bytes'], { type: 'image/jpeg' });
    multipartBody.append('file', file, 'photo.jpg');

    await api.data({
      locale: 'en',
      path: '/uploads',
      method: 'POST',
      workspace: 'vendor',
      idempotencyKey: 'upload-tap-1',
      multipartBody,
    });

    expect(calls[0]?.init.body).toBe(multipartBody);
    expect(multipartBody.getAll('file')).toHaveLength(1);
    expect(multipartBody.getAll('file')[0]).toMatchObject({
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: file.size,
    });
    expect(headersOf(calls[0])).not.toHaveProperty('Content-Type');
    expect(headersOf(calls[0])).toMatchObject({
      'X-Workspace': 'vendor',
      'Idempotency-Key': 'upload-tap-1',
      Cookie: 'better-auth.session_token=abc',
    });
  });

  it('rejects an ambiguous upload before anything reaches the transport', async () => {
    const { api, calls } = setup([]);

    await expect(
      api.data({
        locale: 'en',
        path: '/uploads',
        method: 'POST',
        body: {},
        multipartBody: new FormData(),
      })
    ).rejects.toThrow('A request cannot contain both JSON and multipart bodies');
    expect(calls).toHaveLength(0);
  });
});

describe('the answer', () => {
  it('reads the envelope and keeps the validator', async () => {
    const { api } = setup([ok({ day: '2026-10-04' }, { etag: 'W/"1"' })]);

    await expect(api.request({ locale: 'en', path: '/home' })).resolves.toEqual({
      notModified: false,
      data: { day: '2026-10-04' },
      etag: 'W/"1"',
    });
  });

  it('sends the validator back, and says when nothing changed', async () => {
    const { api, calls } = setup([new Response(null, { status: 304 })]);

    await expect(api.request({ locale: 'en', path: '/home', etag: 'W/"1"' })).resolves.toEqual({
      notModified: true,
    });
    expect(headersOf(calls[0])).toMatchObject({ 'If-None-Match': 'W/"1"' });
  });

  it("turns a refusal into an ApiError with the store's facts", async () => {
    const { api } = setup([
      new Response(
        JSON.stringify({
          success: false,
          code: 'CONFLICT',
          reason: 'CANCEL_NEEDS_REFUND',
          message: 'Cancel it on the website',
          details: { orderId: 'o1' },
          errors: { reason: ['Required'] },
          requestId: 'req-1',
        }),
        { status: 409, headers: { 'retry-after': '3' } }
      ),
    ]);

    const error = await api.request({ locale: 'en', path: '/orders/o1/actions' }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'CONFLICT',
      reason: 'CANCEL_NEEDS_REFUND',
      message: 'Cancel it on the website',
      details: { orderId: 'o1' },
      errors: { reason: ['Required'] },
      requestId: 'req-1',
      retryAfterSeconds: 3,
    });
    expect(isRetryable(error)).toBe(false);
  });

  it("names what is not the store's answer by its status, with no English sentence", async () => {
    const { api } = setup([
      new Response('<html>Bad gateway</html>', { status: 502 }),
      new Response('oops', { status: 500 }),
    ]);

    const gateway = await api.request({ locale: 'en', path: '/home' }).catch((e) => e);
    const fault = await api.request({ locale: 'en', path: '/home' }).catch((e) => e);

    expect(gateway).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: '' });
    expect(fault).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(isRetryable(gateway)).toBe(true);
  });

  it('turns no answer into a NetworkError', async () => {
    const { api } = setup([new TypeError('Network request failed')]);

    const error = await api.request({ locale: 'en', path: '/home' }).catch((e) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.kind).toBe('offline');
    expect(isRetryable(error)).toBe(true);
  });
});

describe('the answers handled for the whole app', () => {
  it('asks for an update when the store refuses this version, with where the update is', async () => {
    const { api, deps } = setup([
      refused(426, {
        code: 'APP_UPDATE_REQUIRED',
        details: { minVersion: '2.0.0', storeUrl: 'https://apps.example.com/biz' },
      }),
    ]);

    await expect(api.request({ locale: 'en', path: '/orders/o1/actions' })).rejects.toThrow();

    expect(deps.onUpdateRequired).toHaveBeenCalledWith({
      minVersion: '2.0.0',
      storeUrl: 'https://apps.example.com/biz',
    });
  });

  it("reads GET /me again when the operator's access changed under the app", async () => {
    const { api, deps } = setup([
      refused(403, { code: 'WORKSPACE_NOT_AVAILABLE', details: { workspaces: [] } }),
      refused(403, { code: 'VENDOR_NOT_ACTIVE', details: { status: 'suspended' } }),
    ]);

    await api.request({ locale: 'en', path: '/orders', workspace: 'vendor' }).catch(() => {});
    const closed = await api
      .request({ locale: 'en', path: '/orders', workspace: 'vendor' })
      .catch((e) => e);

    expect(deps.onAccessRefused).toHaveBeenNthCalledWith(1, 'WORKSPACE_NOT_AVAILABLE');
    expect(deps.onAccessRefused).toHaveBeenNthCalledWith(2, 'VENDOR_NOT_ACTIVE');
    expect(closed).toMatchObject({ code: 'VENDOR_NOT_ACTIVE', details: { status: 'suspended' } });
  });

  it('re-checks the session once for refusals that come together', async () => {
    let finish: () => void = () => {};
    const onUnauthorized = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { api } = setup(
      [
        refused(401, { code: 'AUTHENTICATION_ERROR' }),
        refused(401, { code: 'AUTHENTICATION_ERROR' }),
      ],
      { onUnauthorized }
    );

    const both = Promise.all([
      api.request({ locale: 'en', path: '/home' }).catch((e) => e),
      api.request({ locale: 'en', path: '/me' }).catch((e) => e),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    finish();
    const [first, second] = await both;

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ status: 401 });
    expect(second).toMatchObject({ status: 401 });
  });

  it('sends a refused request once more when the re-check renewed the session', async () => {
    let cookie = 'better-auth.session_token=old';
    const { api, calls } = setup(
      [refused(401, { code: 'AUTHENTICATION_ERROR' }), ok({ id: 'u1' })],
      {
        getCookie: () => cookie,
        onUnauthorized: () => {
          cookie = 'better-auth.session_token=new';
        },
      }
    );

    await expect(api.data({ locale: 'en', path: '/me' })).resolves.toEqual({ id: 'u1' });
    expect(headersOf(calls[1])).toMatchObject({ Cookie: 'better-auth.session_token=new' });
  });

  it('asks once more in the language the store serves', async () => {
    const { api, calls } = setup([
      refused(404, {
        code: 'LOCALE_NOT_AVAILABLE',
        details: { defaultLocale: 'en', locales: ['en'] },
      }),
      ok({ ok: true }),
    ]);

    await api.request({ locale: 'fr', path: '/config', auth: 'none', etag: 'W/"fr"' });

    expect(calls[1]?.url).toBe('https://shop.example.com/api/mobile/biz/v1/en/config');
    expect(headersOf(calls[1])).not.toHaveProperty('If-None-Match');
  });

  it('keeps the same upload and tap through session renewal and locale fallback', async () => {
    let cookie = 'better-auth.session_token=old';
    const { api, calls } = setup(
      [
        refused(401, { code: 'AUTHENTICATION_ERROR' }),
        refused(404, {
          code: 'LOCALE_NOT_AVAILABLE',
          details: { defaultLocale: 'en', locales: ['en'] },
        }),
        ok({ id: 'upload-1' }),
      ],
      {
        getCookie: () => cookie,
        onUnauthorized: () => {
          cookie = 'better-auth.session_token=new';
        },
      }
    );
    const multipartBody = new FormData();
    multipartBody.append('purpose', 'return_evidence');

    await expect(
      api.data({
        locale: 'fr',
        path: '/uploads',
        method: 'POST',
        workspace: 'platform',
        idempotencyKey: 'evidence-tap-1',
        multipartBody,
      })
    ).resolves.toEqual({ id: 'upload-1' });

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.init.body).toBe(multipartBody);
      expect(headersOf(call)).not.toHaveProperty('Content-Type');
      expect(headersOf(call)).toMatchObject({
        'X-Workspace': 'platform',
        'Idempotency-Key': 'evidence-tap-1',
      });
    }
    expect(headersOf(calls[1])).toMatchObject({ Cookie: 'better-auth.session_token=new' });
    expect(calls[2]?.url).toBe('https://shop.example.com/api/mobile/biz/v1/en/uploads');
  });
});
