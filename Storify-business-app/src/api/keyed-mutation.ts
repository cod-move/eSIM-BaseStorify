import { onlineManager, useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { useCallback } from 'react';

import { attemptFor, isFinal, withRetries, type Attempt } from './attempt';
import { NetworkError } from './errors';

/**
 * A change that carries an `Idempotency-Key`: one key per tap, the same key
 * for that tap's retries, and for a later tap of the same request while the
 * first one has no answer (see `attempt.ts`).
 *
 * Every change of the business API that moves an order's status, stock or
 * money, or sends something to a customer, goes through this hook. A change
 * is never sent while the phone is offline: it fails at once with a
 * `NetworkError`, so nothing goes out minutes later behind the operator's back.
 */

/** Open attempts, by what they change (`attemptKey`). They outlive the screen that started them. */
const open = new Map<string, Attempt<unknown>>();
/** Attempts with a request on its way: a second tap meanwhile is the same tap. */
const inFlight = new Set<string>();
/** Whose taps are being sent: moved on by `clearAttempts`, so a tap of the person before stops. */
let generation = 0;

/**
 * Forgets every open attempt: for a change of person, and before each test. A
 * tap still waiting between its tries stops there instead of going out again
 * under the next person's session.
 */
export function clearAttempts(): void {
  open.clear();
  inFlight.clear();
  generation += 1;
}

/** A tap that came while the same change was already on its way, and was dropped. */
export class AlreadySending extends Error {
  constructor() {
    super('The same change is already being sent');
    this.name = 'AlreadySending';
  }
}

/** A tap of the person who signed out, stopped before its next try. Nobody is told: it was theirs. */
export class AttemptAbandoned extends Error {
  constructor() {
    super('The person who made this change signed out');
    this.name = 'AttemptAbandoned';
  }
}

type KeyedMutationOptions<TRequest, TResult, TContext> = Omit<
  UseMutationOptions<TResult, Error, TRequest, TContext>,
  'mutationFn' | 'retry' | 'networkMode'
> & {
  /**
   * What the change is to, so the attempts of different things never mix:
   * `['order-action', workspace, orderId]`. One attempt per key is open at a
   * time; a different request to the same thing replaces it.
   */
  attemptKey: (request: TRequest) => readonly unknown[];
  /** Sends the request with its key. Retries are this hook's: do not retry inside. */
  send: (request: TRequest, idempotencyKey: string) => Promise<TResult>;
};

export function useKeyedMutation<TRequest, TResult, TContext = unknown>({
  attemptKey,
  send,
  ...options
}: KeyedMutationOptions<TRequest, TResult, TContext>) {
  const mutation = useMutation<TResult, Error, TRequest, TContext>({
    ...options,
    // Never held back to be sent when the connection returns: offline, the
    // change fails at once (below) and the operator is told.
    networkMode: 'always',
    mutationFn: async (request) => {
      if (!onlineManager.isOnline()) throw new NetworkError('offline');

      const id = JSON.stringify(attemptKey(request));
      const attempt = attemptFor(open.get(id) as Attempt<TRequest> | undefined, request);
      open.set(id, attempt);
      const sender = generation;
      try {
        const result = await withRetries(() => {
          if (generation !== sender) throw new AttemptAbandoned();
          return send(attempt.request, attempt.key);
        });
        if (open.get(id) === attempt) open.delete(id);
        return result;
      } catch (error) {
        // The store answered: the key is free. No answer: the change may have
        // been made, so the key stays for the next tap.
        if (isFinal(error) && open.get(id) === attempt) open.delete(id);
        throw error;
      }
    },
  });

  const { mutateAsync } = mutation;
  /**
   * One tap. Resolves to the store's answer; rejects with its refusal or a
   * `NetworkError`. A tap while the same change is on its way (a double tap)
   * rejects with `AlreadySending` and leaves the hook's state to the first.
   */
  const submit = useCallback(
    (request: TRequest) => {
      const id = JSON.stringify(attemptKey(request));
      if (inFlight.has(id)) return Promise.reject(new AlreadySending());
      inFlight.add(id);
      return mutateAsync(request).finally(() => inFlight.delete(id));
    },
    [attemptKey, mutateAsync]
  );

  return { ...mutation, submit };
}
