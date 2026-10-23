import { isApiError } from '@/api/errors';
import { RateLimitDetails, TrackOrderRequest } from '@/contracts/mobile/shop/v1';

export type LookupValues = { orderNumber: string; contact: string };

/** What is wrong with a field: the key of its sentence under `trackOrder.errors`. */
export type LookupErrors = {
  orderNumber?: 'orderNumberRequired';
  contact?: 'contactRequired' | 'contactInvalid';
};

/**
 * Checks the form with the contract's own request: the app adds no rule of its
 * own. The contract's sentences are English, so only where the fault is is kept.
 */
export function validateLookup(
  values: LookupValues
): { request: TrackOrderRequest } | { errors: LookupErrors } {
  const parsed = TrackOrderRequest.safeParse(values);
  if (parsed.success) return { request: parsed.data };

  const errors: LookupErrors = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'orderNumber') errors.orderNumber = 'orderNumberRequired';
    if (issue.path[0] === 'contact' && !errors.contact) {
      errors.contact = issue.code === 'too_small' ? 'contactRequired' : 'contactInvalid';
    }
  }
  return { errors };
}

/** Why the store did not give the order up. */
export type Refusal =
  | { kind: 'not-found' }
  | { kind: 'rate-limited'; seconds: number | undefined }
  | { kind: 'other'; error: unknown };

/**
 * A wrong number and a wrong contact are the same 404; the fifth lookup in 15
 * minutes is followed by a 429 that says how long to wait. Anything else is
 * left to the generic error sentence.
 */
export function refusalOf(error: unknown): Refusal {
  if (isApiError(error) && error.status === 404) return { kind: 'not-found' };
  if (isApiError(error) && error.status === 429) {
    const details = RateLimitDetails.safeParse(error.details);
    return {
      kind: 'rate-limited',
      seconds: error.retryAfterSeconds ?? (details.success ? details.data.retryAfter : undefined),
    };
  }
  return { kind: 'other', error };
}

/** The wait in whole minutes, never less than one. */
export function waitMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
