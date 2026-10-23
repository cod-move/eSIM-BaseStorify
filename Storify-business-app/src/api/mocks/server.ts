/**
 * A stand-in for the store, used when EXPO_PUBLIC_API_MOCK=1.
 *
 * `mockFetch` has the shape of `fetch` and answers from memory, so everything
 * above it (the API client, the auth client, the screens) runs exactly as it
 * does against a real store: the same paths, headers, envelope, ETags,
 * idempotency keys and refusals. It exists so screens can be built before
 * their endpoint is reachable.
 *
 * It plays the server, so it does what the app itself must never do: it
 * formats money and decides what each operator may do.
 *
 * This file only dispatches. It reads the request, checks the language, the
 * session, the workspace and the capability the route asks for (with the
 * business API's own refusals), finds the route that answers, and wraps the
 * answer in the envelope with an ETag. The routes are in `routes/`, one module
 * per area, with their data in `fixtures/`, in the shape of the contract.
 * `routes/index.ts` says how to add an area.
 *
 * The accounts to sign in with are listed in `fixtures/accounts.ts`.
 */
import { Platform } from 'react-native';

import { API_BASE_PATH, WORKSPACES, type Workspace } from '@/contracts/mobile/biz/v1';

import type { MockAccount, MockGrant } from './fixtures/accounts';
import { VENDORS } from './fixtures/accounts';
import { MOCK_LANGUAGES } from './fixtures/shared';
import {
  MockAnswer,
  MockError,
  SESSION_COOKIE,
  json,
  type MockAccess,
  type MockAuthContext,
  type MockContext,
} from './kit';
import { parseMockBody } from './multipart';
import { AREAS } from './routes';
import { resetState, state } from './state';

export { MOCK_PASSWORD, MOCK_TOTP_CODE } from './fixtures/accounts';

const LATENCY_MS = process.env.NODE_ENV === 'test' ? 0 : 300;

const areas = Object.values(AREAS);
const routes = areas.flatMap((area) => area.routes ?? []);
const authRoutes = areas.flatMap((area) => area.authRoutes ?? []);

/** Forgets every session and change, and puts every area back to its fixtures. For tests. */
export function resetMockServer(): void {
  resetState();
  for (const area of areas) area.reset?.();
}

/**
 * The next request to the business API (or the next `times`) is carried out,
 * and its answer is lost on the way back: the app sees no answer at all. For a
 * test of what a retry with the same `Idempotency-Key` does.
 */
export function loseNextAnswer(times = 1): void {
  state.answersToLose = times;
}

/**
 * The next request to the business API (or the next `times`) never reaches the
 * store: nothing is carried out, and the app sees no answer. `only` narrows it
 * to a method and a path (`{ method: 'POST', path: /\/messages$/ }`). For a
 * test of a change that truly did not go through, unlike `loseNextAnswer`.
 */
export function dropNextRequest(times = 1, only: { method?: string; path?: RegExp } = {}): void {
  state.requestsToDrop = times;
  state.dropOnly = only;
}

export const mockFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  const body = await parseMockBody(init?.body);

  if (LATENCY_MS > 0) await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  if (init?.signal?.aborted) {
    const aborted = new Error('Aborted');
    aborted.name = 'AbortError';
    throw aborted;
  }

  if (url.pathname.startsWith('/api/auth/')) {
    const ctx: MockAuthContext = {
      method,
      path: url.pathname.slice('/api/auth'.length),
      query: url.searchParams,
      headers,
      body,
      account: accountOf(headers),
    };
    for (const route of authRoutes) {
      const params = paramsOf(route, ctx);
      if (params) return route.handle(ctx, params);
    }
    return json(404, { code: 'NOT_FOUND', message: `The mock has no ${method} ${url.pathname}` });
  }

  const { method: dropMethod, path: dropPath } = state.dropOnly;
  if (
    state.requestsToDrop > 0 &&
    (!dropMethod || dropMethod === method) &&
    (!dropPath || dropPath.test(url.pathname))
  ) {
    // Lost on the way there: the store never hears of it.
    state.requestsToDrop -= 1;
    throw new TypeError('Network request failed');
  }
  const response = answer(url, method, headers, body);
  if (state.answersToLose > 0) {
    // Carried out above; the phone never hears of it.
    state.answersToLose -= 1;
    throw new TypeError('Network request failed');
  }
  return response;
};

function answer(url: URL, method: string, headers: Headers, body: unknown): Response {
  try {
    if (!url.pathname.startsWith(`${API_BASE_PATH}/`)) {
      throw new MockError(404, 'ROUTE_NOT_FOUND', 'No such route');
    }
    const [locale = '', ...rest] = url.pathname.slice(API_BASE_PATH.length + 1).split('/');
    if (!MOCK_LANGUAGES.some((language) => language.code === locale)) {
      throw new MockError(404, 'LOCALE_NOT_AVAILABLE', `The store has no language "${locale}"`, {
        details: { defaultLocale: 'en', locales: MOCK_LANGUAGES.map(({ code }) => code) },
      });
    }

    const path = `/${rest.map(decodeURIComponent).join('/')}`;
    const route = routes.find((candidate) => paramsOf(candidate, { method, path }));
    if (!route) throw new MockError(404, 'ROUTE_NOT_FOUND', `No such route: ${method} ${path}`);

    const account = route.access === 'public' ? null : signedIn(headers);
    const ctx: MockContext = {
      method,
      locale,
      path,
      query: url.searchParams,
      headers,
      body,
      account,
      grant: account ? grantFor(route.access, account, headers) : null,
    };
    const params = paramsOf(route, ctx) ?? [];
    route.authorize?.(ctx);

    const run = () => envelope(route.handle(ctx, params), headers);
    return toResponse(route.idempotent ? idempotently(ctx, run) : run());
  } catch (error) {
    if (error instanceof MockError) return toResponse(refusal(error));
    throw error;
  }
}

// ─── Who is asking ───────────────────────────────────────────────────────────

/** Whose session the request carries: in its cookie, or on the web in the browser's own jar. */
function accountOf(headers: Headers): MockAccount | null {
  const cookie = headers.get('cookie') ?? '';
  const fromCookie = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const token = fromCookie ?? (Platform.OS === 'web' ? state.browserSession : null);
  return token ? (state.sessions.get(token) ?? null) : null;
}

function signedIn(headers: Headers): MockAccount {
  const account = accountOf(headers);
  if (!account) throw new MockError(401, 'AUTHENTICATION_ERROR', 'Sign in to continue');
  return account;
}

function workspacesOf(account: MockAccount): Workspace[] {
  return account.grants.map((grant) => grant.workspace);
}

function noWorkspace(account: MockAccount, message: string): MockError {
  return new MockError(403, 'WORKSPACE_NOT_AVAILABLE', message, {
    details: { workspaces: workspacesOf(account) },
  });
}

/**
 * The workspace a request is for, by the business API's rules: `X-Workspace`
 * when sent (it must be theirs), else their only one. Two and no header is a
 * question the app has to answer; none is "you cannot work anywhere now".
 */
function chosenGrant(account: MockAccount, headers: Headers, required: boolean): MockGrant | null {
  const asked = headers.get('x-workspace');
  if (asked !== null) {
    if (!(WORKSPACES as readonly string[]).includes(asked)) {
      throw new MockError(
        400,
        'VALIDATION_ERROR',
        `X-Workspace must be one of: ${WORKSPACES.join(', ')}`,
        {
          errors: { 'X-Workspace': ['Unknown workspace'] },
        }
      );
    }
    const grant = account.grants.find((candidate) => candidate.workspace === asked);
    if (!grant) throw noWorkspace(account, 'This workspace is not yours');
    return grant;
  }
  if (account.grants.length === 1) return account.grants[0] ?? null;
  if (!required) return null;
  if (account.grants.length === 0) throw noWorkspace(account, 'You cannot work in this store now');
  throw new MockError(400, 'VALIDATION_ERROR', 'Say which workspace: send X-Workspace', {
    errors: { 'X-Workspace': ['Required with two workspaces'] },
  });
}

function grantFor(access: MockAccess, account: MockAccount, headers: Headers): MockGrant | null {
  if (access === 'public') return null;
  if (access === 'account') return chosenGrant(account, headers, false);

  const grant = chosenGrant(account, headers, true);
  if (!grant) throw noWorkspace(account, 'You cannot work in this store now');
  if (access === 'workspace') return grant;

  if (access.only && grant.workspace !== access.only) {
    throw noWorkspace(account, `This belongs to the ${access.only} workspace`);
  }
  if (!grant.capabilities.includes(access.capability)) {
    // A seller's shop that is not open answers why, not "no permission".
    const vendor = grant.vendorId ? VENDORS[grant.vendorId] : undefined;
    if (vendor && vendor.status !== 'approved') {
      throw new MockError(403, 'VENDOR_NOT_ACTIVE', 'This shop is not open for this', {
        details: { status: vendor.status },
      });
    }
    throw new MockError(403, 'AUTHORIZATION_ERROR', 'You do not have permission to do this');
  }
  return grant;
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

/**
 * A change made once per key: the first answer is kept and given again to a
 * repeat of the same request; the same key with another body is refused.
 */
function idempotently(ctx: MockContext, run: () => Plain): Plain {
  const key = ctx.headers.get('idempotency-key');
  if (!key) {
    throw new MockError(400, 'VALIDATION_ERROR', 'This change needs an Idempotency-Key header', {
      errors: { 'Idempotency-Key': ['Required'] },
    });
  }
  const id = `${ctx.account?.id ?? ''}|${ctx.grant?.workspace ?? 'account'}|${key}`;
  const fingerprint = `${ctx.method} ${ctx.path} ${JSON.stringify(ctx.body ?? null)}`;
  const kept = state.kept.get(id);
  if (kept) {
    if (kept.fingerprint !== fingerprint) {
      throw new MockError(422, 'IDEMPOTENCY_KEY_REUSED', 'This key was used for another request');
    }
    return {
      status: kept.status,
      body: kept.body,
      headers: { 'content-type': 'application/json', 'idempotent-replayed': 'true' },
    };
  }

  let answered: Plain;
  try {
    answered = run();
  } catch (error) {
    if (!(error instanceof MockError)) throw error;
    answered = refusal(error);
  }
  // A refusal (4xx) frees the key, as the store's does; a success is kept.
  if (answered.status < 300 && answered.body !== null) {
    state.kept.set(id, { fingerprint, status: answered.status, body: answered.body });
  }
  return answered;
}

// ─── Responses ───────────────────────────────────────────────────────────────

/** An answer before it becomes a `Response`: its body is text, so it can be kept and replayed. */
type Plain = { status: number; body: string | null; headers: Record<string, string> };

function toResponse({ status, body, headers }: Plain): Response {
  return new Response(body, { status, headers });
}

function envelope(result: unknown, requestHeaders: Headers): Plain {
  const data = result instanceof MockAnswer ? result.data : result;
  const body = JSON.stringify({ success: true, data });

  if (result instanceof MockAnswer) {
    // An entity tag of the route's own: a version, never answered with 304.
    return {
      status: 200,
      body,
      headers: { 'content-type': 'application/json', etag: result.etag },
    };
  }

  const etag = `W/"${hash(body)}"`;
  if (requestHeaders.get('if-none-match') === etag) {
    return { status: 304, body: null, headers: { etag } };
  }
  return {
    status: 200,
    body,
    headers: { 'content-type': 'application/json', etag, date: new Date().toUTCString() },
  };
}

function refusal(error: MockError): Plain {
  return {
    status: error.status,
    body: JSON.stringify({
      success: false,
      code: error.code,
      message: error.message,
      ...error.extra,
      requestId: `mock-${state.nextId++}`,
    }),
    headers: { 'content-type': 'application/json' },
  };
}

/** The groups of the route's path when the route answers the request, else `null`. */
function paramsOf(
  route: { method: string; path: string | RegExp },
  request: { method: string; path: string }
): string[] | null {
  if (route.method !== request.method) return null;
  if (typeof route.path === 'string') return route.path === request.path ? [] : null;
  return route.path.exec(request.path)?.slice(1) ?? null;
}

function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  }
  return (value >>> 0).toString(36);
}
