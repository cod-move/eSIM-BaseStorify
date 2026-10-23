/**
 * What the mock store's routes are written with: the request a route is
 * handed, the shape of a route and of an area, and the error that refuses a
 * request. The dispatcher, `server.ts`, works with the same types.
 */
import type { HttpMethod } from '../client';

import type { MockUser } from './state';

/** A request to the mobile API, as a route is handed it. */
export type MockContext = {
  method: string;
  /** The first part of the path, already checked against the store's languages. */
  locale: string;
  /** The rest of the path, decoded: `/products/canvas-weekender-bag`. */
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
  /** Whose session the request carries. `null` for a guest. */
  user: MockUser | null;
};

/** A request to the store's auth server. Its path is what follows `/api/auth`; it has no locale. */
export type MockAuthContext = Omit<MockContext, 'locale'>;

/**
 * One endpoint of the mobile API.
 *
 * `path` is matched against the whole path after the locale: as it is written
 * (`'/cart'`), or as a pattern anchored at both ends whose groups are handed to
 * `handle` (`/^\/products\/([^/]+)$/`). An area's routes are tried in order,
 * so a fixed path goes before a pattern that would also match it.
 *
 * `handle` returns the answer's `data`; the dispatcher wraps it in the envelope
 * and adds the ETag. It refuses by throwing a `MockError`.
 */
export type MockRoute = {
  method: HttpMethod;
  path: string | RegExp;
  handle: (ctx: MockContext, params: string[]) => unknown;
};

/**
 * One endpoint of the auth server, matched as a `MockRoute` is. The auth server
 * answers in better-auth's own shape, not in the envelope, so `handle` returns
 * the whole response (see `json`).
 */
export type MockAuthRoute = {
  method: HttpMethod;
  path: string | RegExp;
  handle: (ctx: MockAuthContext, params: string[]) => Response;
};

/** What a module in `routes/` exports: one area of the store. `routes/index.ts` lists them. */
export type MockArea = {
  /** Endpoints of the mobile API, `/api/mobile/shop/v1/{locale}/…`. */
  routes?: readonly MockRoute[];
  /** Endpoints of the auth server, `/api/auth/…`. */
  authRoutes?: readonly MockAuthRoute[];
  /**
   * Forgets what the area remembers of its own; `resetMockServer` calls it.
   * What the areas share is in `state.ts` and is forgotten there.
   */
  reset?: () => void;
};

/** Refuses a request: the dispatcher answers with `status` and the contract's error envelope. */
export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly reason?: string,
    /** Field name → what is wrong with it: the envelope's `errors`. */
    readonly errors?: Record<string, string[]>,
    /** What the app needs to recover: the envelope's `details`. */
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

/** The signed-in shopper. A guest is refused, as the store refuses one. */
export function requireUser(ctx: MockContext): MockUser {
  if (!ctx.user) throw new MockError(401, 'AUTHENTICATION_ERROR', 'Sign in to continue');
  return ctx.user;
}

/** The cookie that carries the session: the auth routes set it, the dispatcher reads it. */
export const SESSION_COOKIE = 'better-auth.session_token';

/** A response with a JSON body as it is, without the envelope. */
export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
