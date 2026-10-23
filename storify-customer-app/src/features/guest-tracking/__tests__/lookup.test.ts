import { ApiError } from '@/api/errors';

import { refusalOf, validateLookup, waitMinutes } from '../lookup';

describe('validateLookup', () => {
  it('accepts the number with an email or a phone of at least 7 digits', () => {
    expect(validateLookup({ orderNumber: ' ORD-1005 ', contact: 'guest@example.com' })).toEqual({
      request: { orderNumber: 'ORD-1005', contact: 'guest@example.com' },
    });
    expect(validateLookup({ orderNumber: '1005', contact: '+880 1711-000000' })).toEqual({
      request: { orderNumber: '1005', contact: '+880 1711-000000' },
    });
  });

  it('says which field is missing or wrong', () => {
    expect(validateLookup({ orderNumber: '', contact: '' })).toEqual({
      errors: { orderNumber: 'orderNumberRequired', contact: 'contactRequired' },
    });
    expect(validateLookup({ orderNumber: '1005', contact: '12345' })).toEqual({
      errors: { contact: 'contactInvalid' },
    });
  });
});

describe('refusalOf', () => {
  it('reads a wrong number or contact, which are the same 404', () => {
    expect(refusalOf(new ApiError(404, 'NOT_FOUND', 'Order not found'))).toEqual({
      kind: 'not-found',
    });
  });

  it('reads the wait from Retry-After, else from the details', () => {
    const header = new ApiError(429, 'RATE_LIMIT_EXCEEDED', '', { retryAfterSeconds: 120 });
    const details = new ApiError(429, 'RATE_LIMIT_EXCEEDED', '', { details: { retryAfter: 600 } });
    const neither = new ApiError(429, 'RATE_LIMIT_EXCEEDED', '');

    expect(refusalOf(header)).toEqual({ kind: 'rate-limited', seconds: 120 });
    expect(refusalOf(details)).toEqual({ kind: 'rate-limited', seconds: 600 });
    expect(refusalOf(neither)).toEqual({ kind: 'rate-limited', seconds: undefined });
  });

  it('leaves any other failure to the generic error', () => {
    const error = new ApiError(500, 'INTERNAL_ERROR', '');
    expect(refusalOf(error)).toEqual({ kind: 'other', error });
  });
});

describe('waitMinutes', () => {
  it('rounds up to whole minutes, at least one', () => {
    expect(waitMinutes(900)).toBe(15);
    expect(waitMinutes(61)).toBe(2);
    expect(waitMinutes(5)).toBe(1);
  });
});
