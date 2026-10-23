import type { SheetRequest, SheetResult } from './stripe-sheet.types';

/**
 * Stripe's Payment Sheet is native: the web build has none, and importing the
 * Stripe module there would fail. A card cannot be paid for on the web build.
 */
export function presentCardSheet(_request: SheetRequest): Promise<SheetResult> {
  return Promise.resolve({ kind: 'unsupported' });
}

export function resetStripe(): void {}

/** No sheet on the web build: no bank sends anybody back to one. */
export function handleStripeReturn(_url: string): Promise<void> {
  return Promise.resolve();
}
