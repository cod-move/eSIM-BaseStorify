import { createApiClient, type ApiClientDeps } from '../client';
import { ApiError, isRetryable, localeNotAvailable, NetworkError } from '../errors';
import { useGate } from '../gate';

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
    getCookie: () => '',
    getCartToken: () => null,
    setCartToken: jest.fn(),
    onUpdateRequired: jest.fn(),
    onMaintenance: jest.fn(),
    onUnauthorized: jest.fn(),
    ...overrides,
  };
  return { api: createApiClient(deps), deps, calls };
}

const ok = (data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200, headers });

const refused = (
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) => new Response(JSON.stringify({ success: false, ...body }), { status, headers });

const headersOf = (call: Call | undefined) => call?.init.headers as Record<string, string>;

describe('the request', () => {
  it('puts the locale in the path and sorts the query', async () => {
    const { api, calls } = setup([ok({})]);

    await api.request({
      locale: 'bn',
      path: '/products',
      query: { sort: 'NEWEST', category: 'bags', q: undefined, onSale: true, brand: '' },
    });

    expect(calls[0]?.url).toBe(
      'https://shop.example.com/api/mobile/shop/v1/bn/products?category=bags&onSale=true&sort=NEWEST'
    );
  });

  it('says which app is asking', async () => {
    const { api, calls } = setup([ok({})]);

    await api.request({ locale: 'en', path: '/config' });

    expect(headersOf(calls[0])).toMatchObject({
      'X-App-Version': '1.4.0',
      'X-App-Build': '27',
      'X-App-Platform': 'ios',
      'X-Install-Id': 'install-1',
    });
    expect(calls[0]?.init.credentials).toBe('omit');
  });

  it('never sends the session to an endpoint that answers everybody alike', async () => {
    const { api, calls } = setup([ok({})], {
      getCookie: () => 'better-auth.session_token=abc',
      getCartToken: () => 'cart-1',
    });

    await api.request({ locale: 'en', path: '/products' });

    expect(headersOf(calls[0])).not.toHaveProperty('Cookie');
    expect(headersOf(calls[0])).not.toHaveProperty('X-Cart-Token');
  });

  it('sends the session and the cart token where they are asked for', async () => {
    const { api, calls } = setup([ok({ lines: [] })], {
      getCookie: () => 'better-auth.session_token=abc',
      getCartToken: () => 'cart-1',
    });

    await api.request({ locale: 'en', path: '/cart', auth: 'optional', cart: true });

    expect(headersOf(calls[0])).toMatchObject({
      Cookie: 'better-auth.session_token=abc',
      'X-Cart-Token': 'cart-1',
    });
  });

  // A page cannot set a Cookie header: in a browser the session is the browser's
  // own cookie, and without it a signed-in shopper is a guest to the store.
  it('lets a browser send its own session where the session is asked for, and only there', async () => {
    const { api, calls } = setup([ok({}), ok({})], { browserCookies: true });

    await api.request({ locale: 'en', path: '/me', auth: 'user' });
    await api.request({ locale: 'en', path: '/products' });

    expect(calls[0]?.init.credentials).toBe('same-origin');
    expect(calls[1]?.init.credentials).toBe('omit');
  });

  it("keeps the platform's own cookies out on a phone, where the session goes by hand", async () => {
    const { api, calls } = setup([ok({})], { getCookie: () => 'better-auth.session_token=abc' });

    await api.request({ locale: 'en', path: '/me', auth: 'user' });

    expect(calls[0]?.init.credentials).toBe('omit');
  });

  it('does not take a guest being refused for a session that died', async () => {
    const { api, deps } = setup([
      refused(401, { code: 'AUTHENTICATION_ERROR', message: 'Sign in to continue' }),
    ]);

    await expect(api.request({ locale: 'en', path: '/me', auth: 'user' })).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_ERROR',
    });
    // No session was sent, so there is none to refresh.
    expect(deps.onUnauthorized).not.toHaveBeenCalled();
  });

  it('sends a body as JSON, with the idempotency key', async () => {
    const { api, calls } = setup([ok({})]);

    await api.request({
      locale: 'en',
      path: '/checkout/orders',
      method: 'POST',
      body: { quoteHash: 'h' },
      idempotencyKey: 'key-1',
    });

    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe('{"quoteHash":"h"}');
    expect(headersOf(calls[0])).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-1',
    });
  });
});

describe('the answer', () => {
  it('returns the data and its validator', async () => {
    const { api } = setup([ok({ name: 'Storify' }, { etag: 'W/"1"' })]);

    await expect(api.request({ locale: 'en', path: '/config' })).resolves.toEqual({
      notModified: false,
      data: { name: 'Storify' },
      etag: 'W/"1"',
    });
  });

  it('revalidates with the validator it is given', async () => {
    const { api, calls } = setup([new Response(null, { status: 304 })]);

    const result = await api.request({ locale: 'en', path: '/config', etag: 'W/"1"' });

    expect(headersOf(calls[0])['If-None-Match']).toBe('W/"1"');
    expect(result).toEqual({ notModified: true });
  });

  it('keeps the token of a cart the store has just created', async () => {
    const { api, deps } = setup([ok({ lines: [], cartToken: 'cart-9' })]);

    await api.data({ locale: 'en', path: '/cart/lines', method: 'PUT', body: {}, cart: true });

    expect(deps.setCartToken).toHaveBeenCalledWith('cart-9');
  });
});

describe('a refusal', () => {
  it('becomes an ApiError that carries what the store said', async () => {
    const { api } = setup([
      refused(
        409,
        {
          code: 'CONFLICT',
          reason: 'OUT_OF_STOCK',
          message: 'Out of stock',
          errors: { quantity: ['Too many'] },
          requestId: 'req-1',
        },
        { 'retry-after': '30' }
      ),
    ]);

    const error = await api
      .request({ locale: 'en', path: '/cart/lines' })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'CONFLICT',
      reason: 'OUT_OF_STOCK',
      message: 'Out of stock',
      errors: { quantity: ['Too many'] },
      requestId: 'req-1',
      retryAfterSeconds: 30,
    });
  });

  it('asks to update when a change is refused for the version, and goes on reading', async () => {
    const { api, deps, calls } = setup([
      refused(426, {
        code: 'APP_UPDATE_REQUIRED',
        message: '',
        details: { minVersion: '2.0.0' },
      }),
      ok({ name: 'Storify' }),
    ]);

    await expect(
      api.request({ locale: 'en', path: '/cart/lines', method: 'PUT' })
    ).rejects.toMatchObject({ status: 426, code: 'APP_UPDATE_REQUIRED' });
    expect(deps.onUpdateRequired).toHaveBeenCalledTimes(1);

    // An old version browses: the refusal closed nothing, the next read is sent and answered.
    await expect(api.data({ locale: 'en', path: '/home' })).resolves.toEqual({ name: 'Storify' });
    expect(calls).toHaveLength(2);
    expect(deps.onUpdateRequired).toHaveBeenCalledTimes(1);
  });

  it('hands over what the store says about its maintenance', async () => {
    const { api, deps } = setup([
      refused(503, {
        code: 'STORE_MAINTENANCE',
        message: 'Back at noon',
        data: { title: 'Closed', message: 'Back at noon' },
      }),
    ]);

    await expect(api.request({ locale: 'en', path: '/home' })).rejects.toThrow();
    expect(deps.onMaintenance).toHaveBeenCalledWith({ title: 'Closed', message: 'Back at noon' });
  });

  it('reports a session the store no longer accepts', async () => {
    const { api, deps } = setup(
      [refused(401, { code: 'AUTHENTICATION_ERROR', message: 'Session expired' })],
      { getCookie: () => 'better-auth.session_token=old' }
    );

    await expect(api.request({ locale: 'en', path: '/me', auth: 'user' })).rejects.toThrow();
    expect(deps.onUnauthorized).toHaveBeenCalled();
  });

  it('survives an answer that is not the API speaking', async () => {
    const { api } = setup([new Response('<html>Bad gateway</html>', { status: 404 })]);

    await expect(api.request({ locale: 'en', path: '/home' })).rejects.toMatchObject({
      status: 404,
      code: 'INVALID_RESPONSE',
      message: '',
    });
  });
});

describe('a server fault that is not the API speaking', () => {
  it('has no English sentence of its own, and the code of the same trouble', async () => {
    const { api } = setup([
      new Response('Internal Server Error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
      new Response('<html>Bad gateway</html>', { status: 502 }),
      new Response('upstream timed out', { status: 504, headers: { 'retry-after': '7' } }),
    ]);

    const faults = [
      await api.request({ locale: 'en', path: '/home' }).catch((caught) => caught),
      await api.request({ locale: 'en', path: '/home' }).catch((caught) => caught),
      await api.request({ locale: 'en', path: '/home' }).catch((caught) => caught),
    ];

    // `message` is what the shopper reads when no translation fits: it stays empty,
    // so the translation of the code (or the generic one) is what shows.
    expect(faults).toMatchObject([
      { status: 500, code: 'INTERNAL_ERROR', message: '' },
      { status: 502, code: 'SERVICE_UNAVAILABLE', message: '' },
      { status: 504, code: 'SERVICE_UNAVAILABLE', message: '', retryAfterSeconds: 7 },
    ]);
    expect(faults.every((fault) => isRetryable(fault))).toBe(true);
  });
});

describe('a language the store does not serve', () => {
  const unavailable = (locale = 'en') =>
    refused(404, {
      code: 'LOCALE_NOT_AVAILABLE',
      message: 'Locale not available',
      details: { defaultLocale: locale, locales: [locale, 'bn'] },
    });

  it('is asked again in the language the store names, and the app is told', async () => {
    const { api, deps, calls } = setup([unavailable('en'), ok({ name: 'Storify' })], {
      onLocaleNotAvailable: jest.fn(),
    });

    const result = await api.request({ locale: 'fr', path: '/config', etag: 'W/"fr-1"' });

    expect(result).toEqual({ notModified: false, data: { name: 'Storify' }, etag: undefined });
    // The validator was the French copy's: it does not go out for the English one.
    expect(headersOf(calls[0])['If-None-Match']).toBe('W/"fr-1"');
    expect(headersOf(calls[1])['If-None-Match']).toBeUndefined();
    expect(calls.map((call) => call.url)).toEqual([
      'https://shop.example.com/api/mobile/shop/v1/fr/config',
      'https://shop.example.com/api/mobile/shop/v1/en/config',
    ]);
    expect(deps.onLocaleNotAvailable).toHaveBeenCalledWith({
      defaultLocale: 'en',
      locales: ['en', 'bn'],
    });
  });

  it('is asked again once, not for ever', async () => {
    const { api, calls } = setup([unavailable('bn'), unavailable('en')]);

    await expect(api.request({ locale: 'fr', path: '/config' })).rejects.toMatchObject({
      status: 404,
      code: 'LOCALE_NOT_AVAILABLE',
    });
    expect(calls).toHaveLength(2);
  });

  it('is not asked again when the store names the language that was just refused', async () => {
    const { api, calls } = setup([unavailable('fr')]);

    await expect(api.request({ locale: 'fr', path: '/config' })).rejects.toMatchObject({
      code: 'LOCALE_NOT_AVAILABLE',
    });
    expect(calls).toHaveLength(1);
  });

  it('is left alone when a switched-off API answers 404: that is not a language problem', async () => {
    const { api, deps, calls } = setup(
      [refused(404, { code: 'ROUTE_NOT_FOUND', message: 'Not found', requestId: 'req-2' })],
      { onLocaleNotAvailable: jest.fn() }
    );

    await expect(api.request({ locale: 'bn', path: '/config' })).rejects.toMatchObject({
      status: 404,
      code: 'ROUTE_NOT_FOUND',
    });
    expect(calls).toHaveLength(1);
    expect(deps.onLocaleNotAvailable).not.toHaveBeenCalled();
  });

  it('is told apart by the code, with details that can be read', () => {
    const error = (code: string, details?: Record<string, unknown>) =>
      new ApiError(404, code, '', { details });

    expect(
      localeNotAvailable(error('LOCALE_NOT_AVAILABLE', { defaultLocale: 'en', locales: ['en'] }))
    ).toEqual({ defaultLocale: 'en', locales: ['en'] });
    expect(localeNotAvailable(error('ROUTE_NOT_FOUND'))).toBeNull();
    expect(localeNotAvailable(error('LOCALE_NOT_AVAILABLE'))).toBeNull();
    expect(localeNotAvailable(error('LOCALE_NOT_AVAILABLE', { defaultLocale: 3 }))).toBeNull();
    expect(localeNotAvailable(new NetworkError('offline'))).toBeNull();
  });
});

describe('a session the store refuses', () => {
  const refusedSession = () =>
    refused(401, { code: 'AUTHENTICATION_ERROR', message: 'Session expired' });

  it('is re-checked, not signed out: the refusal stands when the session is the same', async () => {
    const { api, deps, calls } = setup([refusedSession()], {
      getCookie: () => 'better-auth.session_token=old',
    });

    await expect(api.request({ locale: 'en', path: '/me', auth: 'user' })).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_ERROR',
    });
    expect(deps.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });

  it('is sent once more when the re-check renewed the session', async () => {
    let cookie = 'better-auth.session_token=old';
    const { api, calls } = setup([refusedSession(), ok({ name: 'Ada' })], {
      getCookie: () => cookie,
      onUnauthorized: async () => {
        cookie = 'better-auth.session_token=new';
      },
    });

    await expect(api.data({ locale: 'en', path: '/me', auth: 'user' })).resolves.toEqual({
      name: 'Ada',
    });
    expect(calls.map((call) => headersOf(call).Cookie)).toEqual([
      'better-auth.session_token=old',
      'better-auth.session_token=new',
    ]);
  });

  it('is sent once more at most: a renewed session that is refused again stands refused', async () => {
    let renewals = 0;
    const { api, calls } = setup([refusedSession(), refusedSession()], {
      getCookie: () => `better-auth.session_token=${renewals}`,
      onUnauthorized: async () => {
        renewals += 1;
      },
    });

    await expect(api.request({ locale: 'en', path: '/me', auth: 'user' })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(2);
  });

  it('is re-checked once for the requests refused together', async () => {
    let finish: () => void = () => undefined;
    const recheck = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { api, deps } = setup([refusedSession(), refusedSession(), refusedSession()], {
      getCookie: () => 'better-auth.session_token=old',
      onUnauthorized: jest.fn(() => recheck),
    });

    const refusals = Promise.allSettled([
      api.request({ locale: 'en', path: '/me', auth: 'user' }),
      api.request({ locale: 'en', path: '/cart', auth: 'user' }),
      api.request({ locale: 'en', path: '/wishlist', auth: 'user' }),
    ]);
    // Let the three refusals arrive; the re-check is still going on.
    await new Promise((resolve) => setTimeout(resolve, 0));
    finish();

    expect((await refusals).map((outcome) => outcome.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(deps.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('keeps the refusal when the re-check itself fails', async () => {
    const { api } = setup([refusedSession()], {
      getCookie: () => 'better-auth.session_token=old',
      onUnauthorized: () => Promise.reject(new Error('offline')),
    });

    await expect(api.request({ locale: 'en', path: '/me', auth: 'user' })).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_ERROR',
    });
  });
});

describe('the update gate', () => {
  it('asks to update, and lets the shopper say "not now" and go on browsing', () => {
    useGate.setState({ updateRequired: false, maintenance: null });

    useGate.getState().requireUpdate();
    expect(useGate.getState().updateRequired).toBe(true);

    useGate.getState().dismissUpdate();
    expect(useGate.getState().updateRequired).toBe(false);

    // The next change the store refuses asks again.
    useGate.getState().requireUpdate();
    expect(useGate.getState().updateRequired).toBe(true);

    useGate.setState({ updateRequired: false });
  });

  it('closes the app only for maintenance, and an update question leaves it open', () => {
    useGate.setState({ updateRequired: false, maintenance: null });

    useGate.getState().requireUpdate();
    expect(useGate.getState().maintenance).toBeNull();

    useGate.getState().setMaintenance({ title: 'Closed' });
    useGate.getState().dismissUpdate();
    expect(useGate.getState().maintenance).toEqual({ title: 'Closed' });

    useGate.setState({ updateRequired: false, maintenance: null });
  });
});

describe('no answer', () => {
  it('is a NetworkError when the request cannot be sent', async () => {
    const { api } = setup([new TypeError('Network request failed')]);

    const error = await api.request({ locale: 'en', path: '/home' }).catch((caught) => caught);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.kind).toBe('offline');
  });

  it('is a timeout when the store takes too long', async () => {
    const { api } = setup([], {
      // Never answers; gives up only when the client aborts.
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    });

    const error = await api
      .request({ locale: 'en', path: '/home', timeoutMs: 10 })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.kind).toBe('timeout');
  });

  it('is not reported as a failure when the screen itself cancelled', async () => {
    const controller = new AbortController();
    const cancelled = new Error('Aborted');
    const { api } = setup([], {
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(cancelled));
        }),
    });

    const pending = api.request({ locale: 'en', path: '/home', signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toBe(cancelled);
  });
});
