import * as Crypto from 'expo-crypto';

import { isApiError, isNetworkError } from '@/api/errors';
import type { PlaceOrderRequest } from '@/contracts/mobile/shop/v1';

/**
 * One try at placing or paying for an order, as the store sees it.
 *
 * The store performs a request once per `Idempotency-Key` and replays its
 * answer for the same key and body, so the key is what makes a repeated request
 * safe: an answer lost on the way back leaves an order the shopper cannot see,
 * and asking again with the same key hands that order back instead of placing a
 * second one.
 *
 * - A tap starts an attempt with a new key; the tap's own retries reuse it.
 * - An attempt ends when the store gives an answer (an order, or a refusal,
 *   which frees the key). Until then it stays open, so the next tap of the same
 *   form is a retry of it and cannot place a second order.
 * - A form that changed since is another request: it gets a key of its own.
 * - The attempt holds the request as it was first sent, and that is what is sent
 *   again: the store compares the body with the first one's, and only the same
 *   body under the same key gets the first answer back.
 */
export type Attempt = {
  readonly key: string;
  readonly fingerprint: string;
  readonly request: PlaceOrderRequest;
};

/**
 * What makes two requests the same form. The same request always gives the same
 * text, whatever the order of its keys. The human check's token is left out: it
 * is good once, so a shopper who taps again after a lost answer may hold a fresh
 * one, and it is the first request, with its own token, that must be repeated.
 */
function fingerprintOf(request: PlaceOrderRequest): string {
  return JSON.stringify({ ...request, turnstileToken: undefined }, (_key, field: unknown) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([a], [b]) => a.localeCompare(b)))
      : field
  );
}

function startAttempt(
  request: PlaceOrderRequest,
  makeKey: () => string = Crypto.randomUUID
): Attempt {
  return { key: makeKey(), fingerprint: fingerprintOf(request), request };
}

/**
 * The attempt a tap belongs to: the open one when the form is the same,
 * otherwise a new one.
 */
export function attemptFor(
  open: Attempt | null,
  request: PlaceOrderRequest,
  makeKey?: () => string
): Attempt {
  return open?.fingerprint === fingerprintOf(request) ? open : startAttempt(request, makeKey);
}

/**
 * Whether the store has answered, and so the attempt is over. A request that got
 * no answer (no connection, a timeout, a server fault) may or may not have been
 * carried out: the attempt stays open.
 */
export function isFinal(error: unknown): boolean {
  return isApiError(error) && error.status < 500 && !isInProgress(error);
}

function isInProgress(error: unknown): boolean {
  return isApiError(error) && error.code === 'REQUEST_IN_PROGRESS';
}

/** What the store asks to be tried again: its 503 and its "the first request is still running". */
function isTemporary(error: unknown): boolean {
  if (isNetworkError(error) || isInProgress(error)) return true;
  return isApiError(error) && error.status === 503 && error.code !== 'STORE_MAINTENANCE';
}

/** Placing and starting a payment are each limited to 5 per 15 minutes, and a replay counts. */
export const MAX_TRIES = 3;
/** What the store's own `Retry-After` says when it says nothing else (seconds). */
const DEFAULT_WAIT_SECONDS = 2;

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
