/**
 * Passes the app's requests on to a store, so the web build can use one. Development
 * only: `metro.config.js` mounts it in Metro's dev server (`expo start`), which an
 * export or a build never runs, and nothing in `src` imports it, so it cannot end
 * up in an app.
 *
 * Why it exists: a browser cannot call the store directly. The store sends no
 * CORS headers, and its sign-in refuses the dev server's origin. The web build
 * calls its own origin in development (`src/config/env.ts`), and this sends the
 * request on.
 *
 * What it does with a request to `/api/…` (every other path is Metro's):
 *   OPTIONS          answered here, 204. Never forwarded: on a static route it can
 *                    make the store cache a plain-text 500 for every client for
 *                    about a minute.
 *   anything else    forwarded to the store (EXPO_PUBLIC_STORE_DEV_URL) as it is:
 *                    method, path, body, the session cookie both ways. A page the
 *                    dev server served is sent as the app (`Origin` is the app's
 *                    link scheme, `storify://`, as the app on a phone sends it),
 *                    any other origin as it came, for the store to refuse.
 *
 * Why the app's origin: the store marks each session with the client it was
 * signed in from, and its mobile API accepts only the app's. Signed in as a web
 * page, the shopper's session works on the store's website and nowhere in the
 * app, and the app reads its refusal as an email still to be confirmed.
 */
'use strict';

const http = require('node:http');
const https = require('node:https');

const DEFAULT_STORE_URL = 'http://localhost:3000';
/** Added to what is forwarded, to notice a store address that points back at the dev server. */
const LOOP_HEADER = 'x-storify-dev-proxy';

const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];
// Not sent to the store as they came: the dev server's own address.
const NOT_FORWARDED = new Set([...HOP_BY_HOP, 'host', 'origin', 'referer']);
const NOT_RETURNED = new Set(HOP_BY_HOP);

/** The answer the store itself gives; the codes are those of `src/contracts`. */
function failure(status, code, message) {
  return { status, body: { success: false, code, message } };
}

function send(res, { status, body, headers }) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...(body === null ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    ...headers,
  });
  res.end(body === null ? undefined : JSON.stringify(body));
}

function parseStoreUrl(text) {
  const address = (text ?? '').trim() || DEFAULT_STORE_URL;
  let url = null;
  try {
    url = new URL(address);
  } catch {
    // Reported below, with the other way an address can be wrong.
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(
      `EXPO_PUBLIC_STORE_DEV_URL is not a web address: "${address}". Use one like ${DEFAULT_STORE_URL}.`
    );
  }
  return url;
}

/** The app's origin as the store trusts it, `storify://`, from the scheme in the app config. */
function parseAppOrigin(scheme) {
  if (typeof scheme !== 'string' || !/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error(
      `The app link scheme is not a scheme: "${scheme}". Set "scheme" in app.json (or APP_SCHEME), ` +
        'the same as the store has under Settings → Mobile app.'
    );
  }
  return `${scheme}://`;
}

/**
 * The `Origin` to send the store: the app's for a page the dev server served
 * (the origin's host is the host the request came to), the one that came for
 * any other page, none when none came.
 *
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @param {string} appOrigin
 */
function originFor(headers, appOrigin) {
  const origin = headers.origin;
  if (!origin) return undefined;
  try {
    return new URL(origin).host === headers.host ? appOrigin : origin;
  } catch {
    return origin;
  }
}

/**
 * @typedef {(
 *   req: import('node:http').IncomingMessage,
 *   res: import('node:http').ServerResponse,
 *   next: () => void
 * ) => void} Middleware
 * @typedef {(middleware: Middleware, server: unknown) => Middleware} EnhanceMiddleware
 */

/**
 * Connect middleware for the dev server.
 *
 * @param {{ target?: string, scheme?: string, timeoutMs?: number }} [options] `target` is
 *   the store's address, `scheme` the app's link scheme (`storify`).
 * @returns {Middleware}
 */
function createDevProxy({ target, scheme, timeoutMs = 30_000 } = {}) {
  const store = parseStoreUrl(target);
  const appOrigin = parseAppOrigin(scheme);
  const lib = store.protocol === 'https:' ? https : http;

  function forward(req, res) {
    const headers = { host: store.host, [LOOP_HEADER]: '1' };
    for (const [name, value] of Object.entries(req.headers)) {
      if (!NOT_FORWARDED.has(name) && value !== undefined) headers[name] = value;
    }
    const origin = originFor(req.headers, appOrigin);
    if (origin) headers.origin = origin;

    const upstream = lib.request(
      {
        protocol: store.protocol,
        hostname: store.hostname.replace(/^\[|\]$/g, ''),
        port: store.port || (store.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: req.url,
        headers,
        agent: false,
      },
      (reply) => {
        const returned = {};
        for (const [name, value] of Object.entries(reply.headers)) {
          if (!NOT_RETURNED.has(name) && value !== undefined) returned[name] = value;
        }
        res.writeHead(reply.statusCode ?? 502, returned);
        reply.pipe(res);
      }
    );
    upstream.setTimeout(timeoutMs, () => {
      upstream.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }));
    });
    upstream.on('error', (error) => {
      if (res.destroyed) return;
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      send(
        res,
        failure(
          error.code === 'ETIMEDOUT' ? 504 : 502,
          'SERVICE_UNAVAILABLE',
          `The development store at ${store.origin} did not answer (${error.code ?? error.message}). ` +
            'Start it, or set EXPO_PUBLIC_STORE_DEV_URL to its address.'
        )
      );
    });
    // The page was closed or the request given up: stop asking the store.
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  }

  return function devProxy(req, res, next) {
    const url = req.url ?? '/';
    if (url !== '/api' && !url.startsWith('/api/') && !url.startsWith('/api?')) {
      next();
      return;
    }
    if (req.headers[LOOP_HEADER]) {
      send(
        res,
        failure(
          508,
          'SERVICE_UNAVAILABLE',
          'EXPO_PUBLIC_STORE_DEV_URL points at the development server itself. ' +
            `Set it to the store's address, for example ${DEFAULT_STORE_URL}.`
        )
      );
      return;
    }
    if (req.method === 'OPTIONS') {
      send(res, {
        status: 204,
        body: null,
        headers: { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE' },
      });
      return;
    }
    forward(req, res);
  };
}

/**
 * An `enhanceMiddleware` for Metro's `server` config that puts the proxy in front
 * of Metro's own middleware (and of the one that was there, if any).
 *
 * @param {EnhanceMiddleware | undefined} enhanceMiddleware
 * @param {Parameters<typeof createDevProxy>[0]} [options]
 * @returns {EnhanceMiddleware}
 */
function withDevProxy(enhanceMiddleware, options) {
  const proxy = createDevProxy(options);
  return (metroMiddleware, server) => {
    const inner = enhanceMiddleware ? enhanceMiddleware(metroMiddleware, server) : metroMiddleware;
    return (req, res, next) => proxy(req, res, () => inner(req, res, next));
  };
}

module.exports = { createDevProxy, withDevProxy };
