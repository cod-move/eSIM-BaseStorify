/**
 * What the mock store remembers between requests. It lives in memory, so it is
 * gone when the app reloads, and `resetMockServer` forgets it before each test.
 *
 * What the areas share is kept here: carts, wishlists, sessions, and the
 * counter that numbers tokens and request ids. An area that remembers
 * something no other area reads keeps it in its own module and forgets it in
 * its `reset` (see `MockArea` in kit.ts).
 */

export type MockUser = { id: string; name: string; email: string };

/** A cart line as it is kept. The cart's answer, prices and all, is worked out from it on every request. */
export type StoredLine = { productId: string; variantId?: string; quantity: number };

export const state = {
  /** Cart lines, by cart token for a guest and by `user:<id>` for an account. */
  carts: new Map<string, StoredLine[]>(),
  /** The accounts whose cart was first opened already: it starts with the sample lines once. */
  seededCarts: new Set<string>(),
  wishlists: new Map<string, Set<string>>(),
  /** Session token → user. */
  sessions: new Map<string, MockUser>(),
  /** A browser keeps cookies itself and hides them from scripts: this stands in for its jar. */
  browserSession: null as string | null,
  nextId: 1,
};

/** Forgets every cart, wishlist and session, and starts numbering again. */
export function resetState(): void {
  state.carts.clear();
  state.seededCarts.clear();
  state.wishlists.clear();
  state.sessions.clear();
  state.browserSession = null;
  state.nextId = 1;
}
