/**
 * What the mock store's routes are written with: the request a route is
 * handed, the shape of a route and of an area, and the error that refuses a
 * request. The dispatcher, `server.ts`, works with the same types.
 */
import type { Capability, Workspace } from '@/contracts/mobile/biz/v1';

import type { HttpMethod } from '../client';

import type { MockAccount, MockGrant } from './fixtures/accounts';

/** A request to the business API, as a route is handed it. */
export type MockContext = {
  method: string;
  /** The first part of the path, already checked against the store's languages. */
  locale: string;
  /** The rest of the path, decoded: `/orders/ord_1001`. */
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
  /** Whose session the request carries. `null` without one. */
  account: MockAccount | null;
  /**
   * The workspace the request is for, with what the operator may do in it.
   * Set for every route that names a workspace or a capability in `access`.
   */
  grant: MockGrant | null;
};

/** A request to the store's auth server. Its path is what follows `/api/auth`; it has no locale. */
export type MockAuthContext = Omit<MockContext, 'locale' | 'grant'>;

/**
 * Who may call a route, checked by the dispatcher before the route runs, with
 * the business API's own refusals (see `server.ts`):
 * - `public`: anybody, no session (GET /config).
 * - `account`: any operator, in any workspace or none (GET /me, notifications, devices).
 * - `workspace`: any operator, in the workspace the request is for (GET /home).
 * - a capability: the workspace must give it, and the route may belong to one
 *   kind of workspace only (payouts: `vendor`; applications: `platform`).
 */
export type MockAccess =
  'public' | 'account' | 'workspace' | { capability: Capability; only?: Workspace };

/**
 * One endpoint of the business API.
 *
 * `path` is matched against the whole path after the locale: as it is written
 * (`'/orders'`), or as a pattern anchored at both ends whose groups are handed
 * to `handle` (`/^\/orders\/([^/]+)$/`). Routes are tried in order, so a fixed
 * path goes before a pattern that would also match it.
 *
 * `handle` returns the answer's `data` (or a `MockAnswer` to set its ETag); the
 * dispatcher wraps it in the envelope. It refuses by throwing a `MockError`.
 */
export type MockRoute = {
  method: HttpMethod;
  path: string | RegExp;
  access: MockAccess;
  /** The route needs an `Idempotency-Key`; a repeat with the same key and body gets the first answer. */
  idempotent?: boolean;
  /** Recheck target-specific access before both a new attempt and a cached replay. */
  authorize?: (ctx: MockContext) => void;
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
  /** Endpoints of the business API, `/api/mobile/biz/v1/{locale}/…`. */
  routes?: readonly MockRoute[];
  /** Endpoints of the auth server, `/api/auth/…`. */
  authRoutes?: readonly MockAuthRoute[];
  /** Forgets what the area remembers and starts from its fixtures again; `resetMockServer` calls it. */
  reset?: () => void;
};

/** Refuses a request: the dispatcher answers with `status` and the contract's error envelope. */
export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: {
      reason?: string;
      errors?: Record<string, string[]>;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
  }
}

/** An answer with an ETag of the route's own (a product's version), instead of one made from the body. */
export class MockAnswer {
  constructor(
    readonly data: unknown,
    readonly etag: string
  ) {}
}

/** The request's grant, which the dispatcher set because the route's `access` asks for one. */
export function grantOf(ctx: MockContext): MockGrant {
  if (!ctx.grant) throw new Error(`The route ${ctx.method} ${ctx.path} has no workspace access`);
  return ctx.grant;
}

/** The signed-in operator, which the dispatcher made sure of. */
export function accountOf(ctx: MockContext): MockAccount {
  if (!ctx.account) throw new Error(`The route ${ctx.method} ${ctx.path} is public`);
  return ctx.account;
}

/** Refuses unless the grant gives a capability: the second check some actions make (cancel). */
export function requireCapability(ctx: MockContext, capability: Capability): void {
  if (!grantOf(ctx).capabilities.includes(capability)) {
    throw new MockError(403, 'AUTHORIZATION_ERROR', 'You do not have permission to do this');
  }
}

/** The body's fields, as an object; `{}` when it is not one. */
export function bodyOf(ctx: MockContext): Record<string, unknown> {
  return typeof ctx.body === 'object' && ctx.body !== null && !Array.isArray(ctx.body)
    ? (ctx.body as Record<string, unknown>)
    : {};
}

/** Refuses a field the way the API does: 400 VALIDATION_ERROR with the field's error. */
export function invalid(field: string, message: string, reason?: string): MockError {
  return new MockError(400, 'VALIDATION_ERROR', message, {
    reason,
    errors: { [field]: [message] },
  });
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
