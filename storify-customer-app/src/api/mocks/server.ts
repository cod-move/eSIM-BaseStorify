/**
 * A stand-in for the store, used when EXPO_PUBLIC_API_MOCK=1.
 *
 * `mockFetch` has the shape of `fetch` and answers from memory, so everything
 * above it (the API client, the auth client, the screens) runs exactly as it
 * does against a real store: the same paths, headers, envelope, ETags and
 * errors. It exists so screens can be built before their endpoint does.
 *
 * It plays the server, so it does what the app itself must never do: it
 * formats prices and decides what can be bought.
 *
 * This file only dispatches. It reads the request, checks the language, finds
 * the route that answers, and wraps the answer in the envelope with an ETag.
 * The routes are in `routes/`, one module per area of the app, with their data
 * in `fixtures/`, in the shape of the contract. `routes/index.ts` says how to
 * add an area.
 *
 * Sign in with any email and the password `password`.
 */
import { Platform } from 'react-native';

import { API_BASE_PATH, LIST_MAX_LIMIT, ListQuery } from '@/contracts/mobile/shop/v1';

import { MOCK_LANGUAGES } from './fixtures/shared';
import {
  MockError,
  SESSION_COOKIE,
  json,
  type MockAuthContext,
  type MockAuthRoute,
  type MockContext,
  type MockRoute,
} from './kit';
import { AREAS } from './routes';
import { resetState, state, type MockUser } from './state';

export { MOCK_PASSWORD } from './routes/auth';

const LATENCY_MS = process.env.NODE_ENV === 'test' ? 0 : 300;

const areas = Object.values(AREAS);
const routes = areas.flatMap((area) => area.routes ?? []);
const authRoutes = areas.flatMap((area) => area.authRoutes ?? []);

/** Forgets every cart, wishlist and session, and what each area remembers. For tests. */
export function resetMockServer(): void {
  resetState();
  for (const area of areas) area.reset?.();
}

export const mockFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  // A JSON body is handed over parsed; a form (a file and its fields) as it is.
  const body =
    typeof init?.body === 'string' && init.body
      ? JSON.parse(init.body)
      : init?.body instanceof FormData
        ? init.body
        : undefined;

  if (LATENCY_MS > 0) await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  if (init?.signal?.aborted) {
    const aborted = new Error('Aborted');
    aborted.name = 'AbortError';
    throw aborted;
  }

  if (url.pathname.startsWith('/api/auth/')) {
    return answerAuth({
      method,
      path: url.pathname.slice('/api/auth'.length),
      query: url.searchParams,
      headers,
      body,
      user: userOf(headers),
    });
  }

  try {
    if (!url.pathname.startsWith(`${API_BASE_PATH}/`)) {
      throw new MockError(404, 'ROUTE_NOT_FOUND', 'No such route');
    }
    const [locale = '', ...rest] = url.pathname.slice(API_BASE_PATH.length + 1).split('/');
    if (!MOCK_LANGUAGES.some((language) => language.code === locale)) {
      throw new MockError(404, 'NOT_FOUND', `The store has no language "${locale}"`);
    }

    const data = answer({
      method,
      locale,
      path: `/${rest.map(decodeURIComponent).join('/')}`,
      query: url.searchParams,
      headers,
      body,
      user: userOf(headers),
    });
    return respond(data, headers);
  } catch (error) {
    if (error instanceof MockError) {
      return json(error.status, {
        success: false,
        code: error.code,
        reason: error.reason,
        message: error.message,
        errors: error.errors,
        details: error.details,
        requestId: `mock-${state.nextId++}`,
      });
    }
    throw error;
  }
};

/** The `data` of the first route that answers the request. */
function answer(ctx: MockContext): unknown {
  checkListLimit(ctx.query);
  for (const route of routes) {
    const params = paramsOf(route, ctx);
    if (params) return route.handle(ctx, params);
  }
  throw new MockError(404, 'ROUTE_NOT_FOUND', `No such route: ${ctx.method} ${ctx.path}`);
}

/**
 * Refuses a `limit` the contract does not allow, as the store does with a 400,
 * so that a screen asking for a bigger page than the store gives fails here too.
 */
function checkListLimit(query: URLSearchParams): void {
  const limit = query.get('limit');
  if (limit !== null && !ListQuery.shape.limit.safeParse(Number(limit)).success) {
    throw new MockError(400, 'VALIDATION_ERROR', 'Some details are not right', undefined, {
      limit: [`Must be a whole number from 1 to ${LIST_MAX_LIMIT}`],
    });
  }
}

/** The auth server's answer, as it is: the auth server has no envelope. */
function answerAuth(ctx: MockAuthContext): Response {
  for (const route of authRoutes) {
    const params = paramsOf(route, ctx);
    if (params) return route.handle(ctx, params);
  }
  return json(404, {
    code: 'NOT_FOUND',
    message: `The mock has no ${ctx.method} /api/auth${ctx.path}`,
  });
}

/** The groups of the route's path when the route answers the request, else `null`. */
function paramsOf(
  route: MockRoute | MockAuthRoute,
  request: { method: string; path: string }
): string[] | null {
  if (route.method !== request.method) return null;
  if (typeof route.path === 'string') return route.path === request.path ? [] : null;
  return route.path.exec(request.path)?.slice(1) ?? null;
}

/** Whose session the request carries: in its cookie, or on the web in the browser's own jar. */
function userOf(headers: Headers): MockUser | null {
  const cookie = headers.get('cookie') ?? '';
  const fromCookie = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const token = fromCookie ?? (Platform.OS === 'web' ? state.browserSession : null);
  return token ? (state.sessions.get(token) ?? null) : null;
}

// ─── Responses ───────────────────────────────────────────────────────────────

function respond(data: unknown, requestHeaders: Headers): Response {
  const body = JSON.stringify({ success: true, data });
  const etag = `W/"${hash(body)}"`;

  if (requestHeaders.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json', etag, date: new Date().toUTCString() },
  });
}

function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  }
  return (value >>> 0).toString(36);
}
