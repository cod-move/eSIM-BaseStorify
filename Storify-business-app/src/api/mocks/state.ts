/**
 * What the mock store remembers between requests that more than one area
 * reads: the sessions, the answers kept for idempotency keys, the counter that
 * numbers tokens and request ids, and the switches a test flips. It lives in
 * memory, so it is gone when the app reloads, and `resetMockServer` forgets it
 * before each test.
 *
 * An area that remembers something no other area reads (its orders, its
 * products) keeps it in its own module and starts again in its `reset`.
 */
import type { MockAccount } from './fixtures/accounts';

/** An answer kept for its `Idempotency-Key`, with the request it answered. */
export type KeptAnswer = { fingerprint: string; status: number; body: string };

export const state = {
  /** Session token → the account signed in with it. */
  sessions: new Map<string, MockAccount>(),
  /** A browser keeps cookies itself and hides them from scripts: this stands in for its jar. */
  browserSession: null as string | null,
  /** `<account>|<key>` → the first answer to that key. */
  kept: new Map<string, KeptAnswer>(),
  /** How many of the next requests are carried out with their answers never arriving (see `loseNextAnswer`). */
  answersToLose: 0,
  /** How many of the next requests never reach the store (see `dropNextRequest`), and which. */
  requestsToDrop: 0,
  dropOnly: {} as { method?: string; path?: RegExp },
  nextId: 1,
};

/** Forgets every session and kept answer, and starts numbering again. */
export function resetState(): void {
  state.sessions.clear();
  state.browserSession = null;
  state.kept.clear();
  state.answersToLose = 0;
  state.requestsToDrop = 0;
  state.dropOnly = {};
  state.nextId = 1;
}
