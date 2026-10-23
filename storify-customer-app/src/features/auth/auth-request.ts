import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import type { AuthFetchOptions } from '@/lib/auth-client';

import {
  authErrorField,
  describeAuthError,
  describeAuthRefusal,
  type AuthErrorPayload,
  type AuthField,
} from './auth-error-message';

/**
 * Calling the auth server, and wording what it refused.
 *
 * The better-auth client answers `{ data, error }`. A refusal's facts are in
 * its body, except one: how long to wait after a rate limit, which better-auth
 * sends only as a header (`X-Retry-After`) and the store's own routes send as
 * `Retry-After` as well as in the body. `callAuth` gathers all of them, so the
 * sentence can say how long to wait.
 */

/** A request the auth server answered with a refusal. */
export type AuthRefusal = AuthErrorPayload & { status: number; code: string | null };

/** What the shopper is shown: the sentence, and the field it belongs beside (`null`: the whole form). */
export type AuthError = {
  message: string;
  field: AuthField | null;
  /** The server's code, for a screen that has to react to one (`null` with no answer at all). */
  code: string | null;
};

type Answer = { data: unknown; error: unknown };

export type AuthOutcome<T> = { data: T; refusal: null } | { data: null; refusal: AuthRefusal };

/**
 * Runs one call of the auth client and sorts its answer. Throws only when no
 * answer came back at all (no connection), as `fetch` does.
 */
async function callAuth<T>(
  call: (fetchOptions: AuthFetchOptions) => Promise<Answer>
): Promise<AuthOutcome<T>> {
  let waitHeader: number | null = null;
  const answer = await call({
    onError: ({ response }) => {
      waitHeader = toSeconds(
        response.headers.get('retry-after') ?? response.headers.get('x-retry-after')
      );
    },
  });

  if (answer.error) return { data: null, refusal: toRefusal(answer.error, waitHeader) };
  return { data: answer.data as T, refusal: null };
}

function toRefusal(error: unknown, waitHeader: number | null): AuthRefusal {
  const body = (typeof error === 'object' && error !== null ? error : {}) as Record<
    string,
    unknown
  >;
  const number = (value: unknown) => (typeof value === 'number' ? value : null);

  return {
    status: number(body.status) ?? 0,
    code: typeof body.code === 'string' ? body.code : null,
    message: typeof body.message === 'string' ? body.message : null,
    retryAfterSeconds:
      number(body.retryAfterSeconds) ?? toSeconds(body.retryAfter) ?? waitHeader ?? null,
    attemptsRemaining: number(body.attemptsRemaining),
  };
}

/** A wait in whole seconds, from a header or a body. Dates in `Retry-After` are not sent by the store. */
function toSeconds(value: unknown): number | null {
  const seconds = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(seconds)) {
    return null;
  }
  return Math.max(0, Math.ceil(seconds));
}

/**
 * Words a refusal, or the lack of any answer (`null`), in the shopper's
 * language. A refusal this app has no sentence for gets the generic one: the
 * server's own message is English and is never shown.
 */
function useAuthErrorMessage(): (refusal: AuthRefusal | null) => AuthError {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');

  return useCallback(
    (refusal) => {
      // No answer at all: the connection, not the account.
      if (!refusal) return { message: tErrors('network'), field: null, code: null };

      return {
        message:
          describeAuthError(refusal, (key, values) => t(`errors.${key}`, values)) ??
          describeAuthRefusal(refusal, (key) => tErrors(key)) ??
          tErrors('generic'),
        field: authErrorField(refusal),
        code: refusal.code,
      };
    },
    [t, tErrors]
  );
}

/**
 * The loading and error state every auth hook has. `run` makes one request at
 * a time: a second one while the first is out (a double tap) is dropped, so it
 * never counts twice against the store's lockout.
 */
export function useAuthTask() {
  const describe = useAuthErrorMessage();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const busy = useRef(false);

  /**
   * Resolves to the outcome, or to `null` when there is nothing to act on: no
   * answer came back (the error is already set) or another request was out.
   * A refusal is left to the caller, which words it with `fail` or acts on it.
   */
  const run = useCallback(
    async <T>(call: (fetchOptions: AuthFetchOptions) => Promise<Answer>) => {
      if (busy.current) return null;
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        return await callAuth<T>(call);
      } catch {
        setError(describe(null));
        return null;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [describe]
  );

  const fail = useCallback((refusal: AuthRefusal) => setError(describe(refusal)), [describe]);
  const clearError = useCallback(() => setError(null), []);

  return { isPending, error, run, fail, clearError };
}
