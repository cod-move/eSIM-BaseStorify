import * as Crypto from 'expo-crypto';

import { isApiError, isNetworkError } from './errors';

/**
 * One try at a change the store must make once: an order's next step, units
 * counted in or out, a reply, a decision on an application.
 *
 * The store performs a request once per `Idempotency-Key` and replays its
 * answer for the same key and body, so the key is what makes a repeated request
 * safe. An answer lost on the way back leaves a change the operator cannot
 * see, and asking again with the same key hands that change back instead of
 * making it twice (two "+5" adjustments, two replies).
 *
 * - A tap starts an attempt with a new key; the tap's own retries reuse it.
 * - An attempt ends when the store gives an answer (the change, or a refusal,
 *   which frees the key). Until then it stays open, so the next tap of the
 *   same request is a retry of it and cannot make the change twice.
 * - A request that differs is another change: it gets a key of its own.
 * - The attempt holds the request as it was first sent, and that is what is
 *   sent again: the store compares the body with the first one's, and only the
 *   same body under the same key gets the first answer back.
 */
export type Attempt<T> = {
  readonly key: string;
  readonly fingerprint: string;
  readonly request: T;
};

/** What makes two requests the same: the same text, whatever the order of their keys. */
function fingerprintOf(request: unknown): string {
  return JSON.stringify(request ?? null, (_key, field: unknown) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([a], [b]) => a.localeCompare(b)))
      : field
  );
}

/** The attempt a tap belongs to: the open one when the request is the same, otherwise a new one. */
export function attemptFor<T>(
  open: Attempt<T> | undefined,
  request: T,
  makeKey: () => string = Crypto.randomUUID
): Attempt<T> {
  const fingerprint = fingerprintOf(request);
  return open?.fingerprint === fingerprint ? open : { key: makeKey(), fingerprint, request };
}

/**
 * Whether the store has answered for the attempt's key, and so the attempt is
 * over. A request that got no answer (no connection, a timeout, a server
 * fault) may or may not have been carried out: the attempt stays open.
 *
 * The session, access and rate-limit checks come before the store looks at the
 * key. Such a refusal (401, 403, 429) says nothing about an earlier try of the
 * attempt that got no answer and may have been carried out, so it keeps the key
 * too: the next tap replays that try's answer instead of making it twice.
 */
export function isFinal(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.status < 500 &&
    !REFUSED_BEFORE_THE_KEY.has(error.status) &&
    !isInProgress(error)
  );
}

const REFUSED_BEFORE_THE_KEY = new Set([401, 403, 429]);

function isInProgress(error: unknown): boolean {
  return isApiError(error) && error.code === 'REQUEST_IN_PROGRESS';
}

/** What is worth sending again at once: no answer, the store's 503, and "the first request is still running". */
function isTemporary(error: unknown): boolean {
  if (isNetworkError(error) || isInProgress(error)) return true;
  return isApiError(error) && error.status === 503;
}

/** Tries per tap. Changes are rate limited per operator, and a replay counts. */
export const MAX_TRIES = 3;
/** What the store's own `Retry-After` says when it says nothing else (seconds). */
const DEFAULT_WAIT_SECONDS = 1;

export type Sleep = (milliseconds: number) => Promise<void>;
const sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function waitFor(error: unknown, triesSoFar: number): number {
  if (isApiError(error)) return (error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS) * 1000;
  // No answer at all: a short pause that grows, so a connection that is coming back is given time.
  return triesSoFar * 1000;
}

/**
 * Sends the request, and sends it again, with the same key, when the store
 * asked for it or no answer came back. Anything else is the answer.
 */
export async function withRetries<T>(send: () => Promise<T>, wait: Sleep = sleep): Promise<T> {
  for (let tries = 1; ; tries += 1) {
    try {
      return await send();
    } catch (error) {
      if (tries >= MAX_TRIES || !isTemporary(error)) throw error;
      await wait(waitFor(error, tries));
    }
  }
}
