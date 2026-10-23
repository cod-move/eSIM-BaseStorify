import * as z from 'zod';

import {
  API_BASE_PATH,
  REQUEST_HEADERS,
  type AppUpdateRequiredDetails,
  type Workspace,
} from '@/contracts/mobile/biz/v1';

import { ApiError, appUpdateRequired, localeNotAvailable, NetworkError } from './errors';

/**
 * The store's business API, as the app sees it.
 *
 * This is the only module that talks HTTP to the store (sign-in aside, which
 * belongs to `lib/auth-client`). Everything the contract asks of a request is
 * done here, once: the locale in the path, the app's headers, the session
 * cookie, the workspace, conditional requests, idempotency keys, the error
 * envelope. A screen never builds a URL or reads a status code.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiRequest = {
  /** The language of the answer. It is part of the path, so it is part of the cache key too. */
  locale: string;
  /** The endpoint, without the base path and the locale: `/orders/123`. */
  path: string;
  method?: HttpMethod;
  /** Values that are `undefined` or empty are left out. */
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Multipart uploads. The transport supplies the boundary; do not also pass `body`. */
  multipartBody?: FormData;
  /**
   * Who the answer is for.
   * - `user` (the default): the signed-in operator. Every endpoint but
   *   `GET /config` needs the session; the store answers 401 without one.
   * - `none`: everybody gets the same answer (`GET /config`). No cookie is
   *   sent, so a cache between the app and the store can never keep one
   *   person's answer for another.
   */
  auth?: 'none' | 'user';
  /**
   * The workspace the request is for, sent as `X-Workspace`. Every endpoint of
   * a workspace takes it (orders, products, inbox, payouts, applications,
   * home); the account's own (`/me`, notifications, devices) do not.
   */
  workspace?: Workspace;
  /** The validator of the copy the app already has. The store answers "not modified" if it still holds. */
  etag?: string;
  /** The version a change was made against (`If-Match`). The store refuses it (412) when that is no longer current. */
  ifMatch?: string;
  /** Makes a repeated request safe: the store performs it once and replays the answer. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type ApiResult<T> =
  { notModified: false; data: T; etag: string | undefined } | { notModified: true };

/** Why the store refused a request because of who is asking, rather than what they asked. */
export type AccessRefusal = 'WORKSPACE_NOT_AVAILABLE' | 'VENDOR_NOT_ACTIVE';

export type ApiClientDeps = {
  /** The store's address, without a slash at the end. */
  baseUrl: string;
  fetch: typeof fetch;
  appInfo: { version: string; build: string; platform: string };
  getInstallId: () => string;
  /** The session cookie, or an empty string when nobody is signed in. */
  getCookie: () => string;
  /**
   * The browser keeps the session cookie itself (the web build), and a page
   * cannot set a `Cookie` header: a request that carries the session leaves it
   * to the browser. On a phone the cookie goes by hand, from `getCookie`.
   */
  browserCookies?: boolean;
  /** The store refused a change because this version of the app is too old. Reading goes on. */
  onUpdateRequired: (details: AppUpdateRequiredDetails | null) => void;
  /**
   * The store no longer accepts the session the app sent. Re-check who is signed
   * in: one refusal does not sign anybody out, a session the store confirms gone
   * does. When the returned promise settles and the cookie has changed, the
   * request is sent once more with the new one.
   */
  onUnauthorized: () => Promise<unknown> | void;
  /**
   * The operator's access changed under the app: the workspace is not theirs
   * any more, or the seller's shop was closed. What they may do is GET /me's to
   * say, so the app reads it again.
   */
  onAccessRefused?: (refusal: AccessRefusal) => void;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/** The second chances a request has taken. Each one is taken once, so a refusal cannot loop. */
type Spent = { locale: boolean; session: boolean };

export function createApiClient(deps: ApiClientDeps) {
  // Several requests are refused together when a session dies (Home's figures,
  // the order list and the notifications all load at start): one re-check
  // answers them all.
  let recheck: Promise<void> | undefined;

  function recheckSession(): Promise<void> {
    recheck ??= Promise.resolve()
      .then(() => deps.onUnauthorized())
      // A re-check that fails changes nothing: the refusal stands, and the caller gets it.
      .then(
        () => undefined,
        () => undefined
      )
      .finally(() => {
        recheck = undefined;
      });
    return recheck;
  }

  async function request<T>(req: ApiRequest, schema?: z.ZodType<T>): Promise<ApiResult<T>> {
    return perform(req, schema, { locale: false, session: false });
  }

  async function perform<T>(
    req: ApiRequest,
    schema: z.ZodType<T> | undefined,
    spent: Spent
  ): Promise<ApiResult<T>> {
    const method = req.method ?? 'GET';
    const auth = req.auth ?? 'user';
    if (req.body !== undefined && req.multipartBody !== undefined) {
      throw new TypeError('A request cannot contain both JSON and multipart bodies');
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      [REQUEST_HEADERS.appVersion]: deps.appInfo.version,
      [REQUEST_HEADERS.appBuild]: deps.appInfo.build,
      [REQUEST_HEADERS.appPlatform]: deps.appInfo.platform,
      [REQUEST_HEADERS.installId]: deps.getInstallId(),
    };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (req.etag) headers['If-None-Match'] = req.etag;
    if (req.ifMatch) headers[REQUEST_HEADERS.ifMatch] = req.ifMatch;
    if (req.idempotencyKey) headers[REQUEST_HEADERS.idempotencyKey] = req.idempotencyKey;
    if (req.workspace) headers[REQUEST_HEADERS.workspace] = req.workspace;

    const cookie = auth === 'none' ? '' : deps.getCookie();
    if (cookie) headers.Cookie = cookie;

    const response = await send(deps.fetch, buildUrl(deps.baseUrl, req), {
      method,
      headers,
      body: req.multipartBody ?? (req.body === undefined ? undefined : JSON.stringify(req.body)),
      credentials: deps.browserCookies && auth !== 'none' ? 'same-origin' : 'omit',
      signal: req.signal,
      timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    if (response.status === 304) return { notModified: true };

    const body = await readJson(response);

    if (response.ok && isRecord(body) && body.success === true && 'data' in body) {
      const data = body.data as T;
      if (__DEV__ && schema) warnOnContractMismatch(schema, data, `${method} ${req.path}`);
      return { notModified: false, data, etag: response.headers.get('etag') ?? undefined };
    }

    const error = toApiError(response, body);

    // The store dropped the language of the path (a switched-off language, or one
    // an old install still asks for). It names the one it serves: ask again in it.
    // The validator belongs to a copy in the old language, so it stays behind.
    const unavailable = localeNotAvailable(error);
    if (unavailable && !spent.locale && unavailable.defaultLocale !== req.locale) {
      return perform({ ...req, locale: unavailable.defaultLocale, etag: undefined }, schema, {
        ...spent,
        locale: true,
      });
    }

    if (error.status === 426 || error.code === 'APP_UPDATE_REQUIRED') {
      deps.onUpdateRequired(appUpdateRequired(error));
    } else if (error.code === 'WORKSPACE_NOT_AVAILABLE' || error.code === 'VENDOR_NOT_ACTIVE') {
      deps.onAccessRefused?.(error.code);
    } else if (error.status === 401 && cookie) {
      await recheckSession();

      // The re-check renewed the session while the request was on its way: the
      // refusal was about the old one. A refused request was not carried out, so
      // sending it again is safe, writes included.
      const renewed = deps.getCookie();
      if (renewed && renewed !== cookie && !spent.session && !req.signal?.aborted) {
        return perform(req, schema, { ...spent, session: true });
      }
    }

    throw error;
  }

  /** For a request that sends no `etag`, where "not modified" cannot be the answer. */
  async function data<T>(req: Omit<ApiRequest, 'etag'>, schema?: z.ZodType<T>): Promise<T> {
    const result = await request(req, schema);
    if (result.notModified) {
      throw new ApiError(304, 'INVALID_RESPONSE', 'Not modified, but nothing was cached');
    }
    return result.data;
  }

  return { request, data };
}

function buildUrl(baseUrl: string, req: ApiRequest): string {
  const url = `${baseUrl}${API_BASE_PATH}/${encodeURIComponent(req.locale)}${req.path}`;

  // Sorted, so the same question always has the same address.
  const pairs = Object.entries(req.query ?? {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .sort();

  return pairs.length > 0 ? `${url}?${pairs.join('&')}` : url;
}

async function send(
  fetchImpl: typeof fetch,
  url: string,
  options: {
    method: HttpMethod;
    headers: Record<string, string>;
    body: string | FormData | undefined;
    /**
     * `omit` unless a browser sends its own session. On a phone the session
     * cookie is attached by hand, and the platform's own cookie jar must stay
     * out of it, or a second, stale cookie follows.
     */
    credentials: RequestCredentials;
    signal: AbortSignal | undefined;
    timeoutMs: number;
  }
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel);

  try {
    return await fetchImpl(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
      credentials: options.credentials,
    });
  } catch (error) {
    // Cancelled by whoever asked (a screen was left): not a failure to report.
    if (options.signal?.aborted) throw error;
    throw new NetworkError(timedOut ? 'timeout' : 'offline', error);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  } catch {
    // Not JSON: a proxy's error page, or the plain text of a server fault. The status still tells enough.
    return undefined;
  }
}

/**
 * What a status stands for when the answer is not the store's own envelope. The
 * codes are the ones the store itself sends for the same trouble, so the
 * operator reads the translation the app already has for them.
 */
function codeOfForeignAnswer(status: number): string {
  if (status === 502 || status === 503 || status === 504) return 'SERVICE_UNAVAILABLE';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'INVALID_RESPONSE';
}

function toApiError(response: Response, body: unknown): ApiError {
  const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
  const retryAfterSeconds = Number.isFinite(retryAfter) ? retryAfter : undefined;

  if (!isRecord(body) || body.success !== false || typeof body.code !== 'string') {
    // Not the store speaking. No sentence of ours goes in `message`: it would be
    // English, and it is what the operator reads when no translation fits.
    return new ApiError(response.status, codeOfForeignAnswer(response.status), '', {
      retryAfterSeconds,
    });
  }

  return new ApiError(
    response.status,
    body.code,
    typeof body.message === 'string' ? body.message : '',
    {
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      errors: isRecord(body.errors) ? (body.errors as Record<string, string[]>) : undefined,
      details: isRecord(body.details) ? body.details : undefined,
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      retryAfterSeconds,
    }
  );
}

/**
 * In development, says so when an answer does not match its contract. It only
 * warns: the store may be ahead of the app (the contract allows additions), and
 * a screen that can still draw should draw.
 */
function warnOnContractMismatch<T>(schema: z.ZodType<T>, data: unknown, label: string): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      `[contract] ${label} does not match its contract:\n${z.prettifyError(result.error)}`
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
