/**
 * The development proxy (scripts/dev-proxy.js): what it passes on to a store and
 * how. The store here is a local server that writes down every request it gets,
 * so what arrives is checked on its side.
 *
 * Node's own types are not part of this project (tsconfig `types` is ["jest"]),
 * so the few `http` calls the test makes are typed here.
 */
import { createDevProxy, withDevProxy } from '../../../scripts/dev-proxy';

type Headers = Record<string, string | string[] | undefined>;
type Incoming = {
  method?: string;
  url?: string;
  headers: Headers;
  setEncoding(encoding: string): void;
  on(event: 'data', handler: (chunk: string) => void): void;
  on(event: 'end', handler: () => void): void;
};
type Outgoing = {
  writeHead(status: number, headers?: Record<string, string | string[]>): unknown;
  end(body?: string): unknown;
};
type Server = {
  listen(port: number, host: string, done: () => void): unknown;
  address(): { port: number };
  close(done: () => void): unknown;
  closeAllConnections(): void;
};
type ClientResponse = {
  statusCode?: number;
  headers: Headers;
  setEncoding(encoding: string): void;
  on(event: 'data', handler: (chunk: string) => void): void;
  on(event: 'end', handler: () => void): void;
};
type Http = {
  createServer(listener?: (req: Incoming, res: Outgoing) => void): Server;
  request(
    options: {
      host: string;
      port: number;
      method: string;
      path: string;
      headers: Record<string, string>;
      agent: false;
    },
    done: (res: ClientResponse) => void
  ): {
    on(event: 'error', handler: (error: Error) => void): void;
    end(body?: string): void;
  };
};

type Middleware = Parameters<ReturnType<typeof withDevProxy>>[0];
type Reply = { status: number; headers: Headers; body: string };
type Seen = { method?: string; url?: string; headers: Headers; body: string };

const { createServer, request } = jest.requireActual<Http>('node:http');

const servers: Server[] = [];
let seen: Seen[] = [];
let storePort = 0;
let devPort = 0;

/** Starts a server on a free local port. */
async function listen(listener: (req: Incoming, res: Outgoing) => void): Promise<number> {
  const server = createServer(listener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

function startStore(): Promise<number> {
  return listen((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        ETag: '"v1"',
        'Set-Cookie': ['better-auth.session_token=abc; Path=/; HttpOnly', 'visitor=1; Path=/'],
      });
      res.end(JSON.stringify({ success: true, data: { from: 'store' } }));
    });
  });
}

function startDevServer(target: string): Promise<number> {
  const proxy = createDevProxy({ target, scheme: 'storifybiz' });
  return listen((req, res) =>
    proxy(req, res, () => {
      res.writeHead(404);
      res.end('metro');
    })
  );
}

/** A request sent as written: Node's client does not tidy the path. */
function call(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers, agent: false }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text })
      );
    });
    req.on('error', reject);
    req.end(body);
  });
}

beforeAll(async () => {
  storePort = await startStore();
  devPort = await startDevServer(`http://127.0.0.1:${storePort}`);
});

beforeEach(() => {
  seen = [];
});

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        })
    )
  );
});

describe('what is forwarded', () => {
  it.each([
    ['GET', '/api/mobile/shop/v1/en/config'],
    ['GET', '/api/mobile/shop/v1/en/products?q=chair&page=2'],
    ['GET', '/api/mobile/shop/v1/en/cart'],
    ['GET', '/api/auth/get-session'],
    ['PUT', '/api/mobile/shop/v1/en/cart/items/1'],
    ['PATCH', '/api/mobile/shop/v1/en/account/profile'],
    ['DELETE', '/api/mobile/shop/v1/en/wishlist/1'],
  ])('forwards %s %s as it is', async (method, path) => {
    const reply = await call(devPort, method, path);

    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ success: true, data: { from: 'store' } });
    expect(reply.headers.etag).toBe('"v1"');
    expect(seen.map(({ method: m, url }) => ({ method: m, url }))).toEqual([{ method, url: path }]);
  });

  it('forwards a sign-in with its body, and hands back the session cookie', async () => {
    const body = JSON.stringify({ email: 'shopper@example.com', password: 'secret' });
    const reply = await call(
      devPort,
      'POST',
      '/api/auth/sign-in/email',
      { 'Content-Type': 'application/json' },
      body
    );

    expect(reply.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/auth/sign-in/email', body });
    expect(seen[0]?.headers['content-type']).toBe('application/json');
    expect(reply.headers['set-cookie']).toEqual([
      'better-auth.session_token=abc; Path=/; HttpOnly',
      'visitor=1; Path=/',
    ]);
  });

  it("sends the store's own cookies only, not the other localhost apps'", async () => {
    await call(devPort, 'GET', '/api/mobile/biz/v1/en/me', {
      Cookie:
        'other_app_session=secret; better-auth.session_token=abc; theme=dark; __Secure-better-auth.session_data=xyz',
    });

    expect(seen[0]?.headers.cookie).toBe(
      'better-auth.session_token=abc; __Secure-better-auth.session_data=xyz'
    );
  });

  it("sends the shopper's session and the app's headers to the store", async () => {
    await call(devPort, 'GET', '/api/mobile/shop/v1/en/cart', {
      Cookie: 'better-auth.session_token=abc',
      Authorization: 'Bearer abc',
      'Accept-Language': 'bn',
      'X-Install-Id': 'abc',
      'Expo-Origin': 'storifybiz://',
    });

    expect(seen[0]?.headers).toMatchObject({
      host: `127.0.0.1:${storePort}`,
      cookie: 'better-auth.session_token=abc',
      authorization: 'Bearer abc',
      'accept-language': 'bn',
      'x-install-id': 'abc',
      'expo-origin': 'storifybiz://',
      'x-storify-dev-proxy': '1',
    });
  });

  // The store signs a browser's page in to its website, and the mobile API
  // refuses that session: the app's sign-up would end at "check your email".
  it("sends a page of the dev server's own as the app, so the store opens an app session", async () => {
    await call(devPort, 'POST', '/api/auth/sign-in/email', {
      Host: 'localhost:8081',
      Origin: 'http://localhost:8081',
      Referer: 'http://localhost:8081/sign-in',
    });

    expect(seen[0]?.headers.origin).toBe('storifybiz://');
    expect(seen[0]?.headers).not.toHaveProperty('referer');
  });

  it('leaves the origin of a page from elsewhere as it is, for the store to refuse', async () => {
    await call(devPort, 'POST', '/api/auth/sign-in/email', {
      Host: 'localhost:8081',
      Origin: 'https://elsewhere.example',
    });

    expect(seen[0]?.headers.origin).toBe('https://elsewhere.example');
  });

  it('adds no origin to a request that came without one, as the app on a phone sends', async () => {
    await call(devPort, 'POST', '/api/auth/sign-in/email');

    expect(seen[0]?.headers).not.toHaveProperty('origin');
  });

  it('says so when the store does not answer', async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const closedPort = probe.address().port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const port = await startDevServer(`http://127.0.0.1:${closedPort}`);

    const reply = await call(port, 'GET', '/api/mobile/shop/v1/en/config');

    expect(reply.status).toBe(502);
    expect(JSON.parse(reply.body)).toMatchObject({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: expect.stringContaining('EXPO_PUBLIC_STORE_DEV_URL'),
    });
  });
});

describe('what is answered here', () => {
  it('answers OPTIONS itself, without CORS headers', async () => {
    const reply = await call(devPort, 'OPTIONS', '/api/mobile/shop/v1/en/config', {
      Origin: 'http://localhost:8081',
      'Access-Control-Request-Method': 'GET',
    });

    expect(reply.status).toBe(204);
    expect(Object.keys(reply.headers).filter((name) => name.startsWith('access-control-'))).toEqual(
      []
    );
    expect(seen).toEqual([]);
  });

  it('refuses a request that came from itself', async () => {
    const reply = await call(devPort, 'GET', '/api/mobile/shop/v1/en/config', {
      'X-Storify-Dev-Proxy': '1',
    });

    expect(reply.status).toBe(508);
    expect(seen).toEqual([]);
  });

  it('leaves every other path to Metro', async () => {
    for (const path of ['/index.bundle?platform=web', '/apiary', '/_expo/status']) {
      const reply = await call(devPort, 'GET', path);
      expect(reply).toMatchObject({ status: 404, body: 'metro' });
    }
    expect(seen).toEqual([]);
  });
});

describe('in Metro', () => {
  it('goes in front of Metro and of any middleware already there', async () => {
    const metro: Middleware = (_req, res) => {
      res.writeHead(200);
      res.end('metro');
    };
    const enhance = jest.fn((middleware: Middleware) => middleware);
    const enhanced = withDevProxy(enhance, {
      target: `http://127.0.0.1:${storePort}`,
      scheme: 'storifybiz',
    })(metro, {});
    const port = await listen((req, res) => enhanced(req, res, () => undefined));

    expect((await call(port, 'GET', '/status')).body).toBe('metro');
    expect((await call(port, 'POST', '/api/mobile/shop/v1/en/cart/items')).status).toBe(200);
    expect(enhance).toHaveBeenCalledTimes(1);
    expect(seen.map(({ url }) => url)).toEqual(['/api/mobile/shop/v1/en/cart/items']);
  });

  it('stops Metro from starting on an address that is not a web address', () => {
    expect(() =>
      withDevProxy(undefined, { target: 'localhost:3000', scheme: 'storifybiz' })
    ).toThrow('EXPO_PUBLIC_STORE_DEV_URL');
    expect(() =>
      withDevProxy(undefined, { target: 'ftp://localhost', scheme: 'storifybiz' })
    ).toThrow('EXPO_PUBLIC_STORE_DEV_URL');
  });

  it('stops Metro from starting without the app link scheme', () => {
    expect(() => withDevProxy(undefined, { target: 'http://localhost:3000' })).toThrow('scheme');
    expect(() =>
      withDevProxy(undefined, { target: 'http://localhost:3000', scheme: 'not a scheme' })
    ).toThrow('scheme');
  });
});
