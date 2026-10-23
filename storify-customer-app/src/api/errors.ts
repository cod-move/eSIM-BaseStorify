import { LocaleNotAvailableDetails } from '@/contracts/mobile/shop/v1';

/**
 * The two ways a request fails.
 *
 * `ApiError`: the store answered, and the answer was a refusal. It carries the
 * store's own `code` and `reason`, which decide what the app does and says.
 *
 * `NetworkError`: there was no answer: no connection, or none in time.
 */

export type ApiErrorInfo = {
  reason?: string;
  /** Field name → what is wrong with it. */
  errors?: Record<string, string[]>;
  details?: Record<string, unknown>;
  /** Quote this when reporting a problem: it finds the request in the store's logs. */
  requestId?: string;
  /** How long the store asks the app to wait before trying again. */
  retryAfterSeconds?: number;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason?: string;
  readonly errors?: Record<string, string[]>;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  /**
   * `message` is the store's English fallback; show it only when no translation
   * fits. It is empty when the answer was not the store's at all.
   */
  constructor(status: number, code: string, message: string, info: ApiErrorInfo = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.reason = info.reason;
    this.errors = info.errors;
    this.details = info.details;
    this.requestId = info.requestId;
    this.retryAfterSeconds = info.retryAfterSeconds;
  }
}

export class NetworkError extends Error {
  readonly kind: 'offline' | 'timeout';

  constructor(kind: 'offline' | 'timeout', cause?: unknown) {
    super(kind === 'timeout' ? 'The request timed out' : 'The request could not be sent', {
      cause,
    });
    this.name = 'NetworkError';
    this.kind = kind;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Whether asking again could give a different answer. A refusal (4xx) will be
 * the same refusal; a missing connection or a server fault may have passed.
 */
export function isRetryable(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (isApiError(error)) return error.status >= 500 && error.code !== 'STORE_MAINTENANCE';
  return false;
}

/**
 * What the store says to a language it does not serve (any more): the language
 * it does serve by default, and all of them. `null` for every other error.
 *
 * ROUTE_NOT_FOUND is a 404 as well, but it means the store's app API is
 * switched off, and no language would help: only the code tells the two apart.
 */
export function localeNotAvailable(error: unknown): LocaleNotAvailableDetails | null {
  if (!isApiError(error) || error.code !== 'LOCALE_NOT_AVAILABLE') return null;
  const details = LocaleNotAvailableDetails.safeParse(error.details);
  return details.success ? details.data : null;
}
