import type { SheetRequest, SheetResult } from './stripe-sheet.types';

/**
 * The card sheet on the mock store. The mock's intent is no Stripe intent:
 * Stripe's own sheet refuses its key and client secret, so the card is taken
 * as paid here, and the mock's confirm says how the payment ended (the words
 * in `PAYMENT_SWITCH`, typed into the order note, choose it).
 */
export function presentMockSheet(_request: SheetRequest): Promise<SheetResult> {
  return Promise.resolve({ kind: 'paid' });
}
