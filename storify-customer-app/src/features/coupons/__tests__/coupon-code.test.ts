import { couponCodeToPlace } from '../coupon-code';

describe('couponCodeToPlace', () => {
  it('drops a code the quote marked INVALID, whatever its case', () => {
    expect(
      couponCodeToPlace('save10', { code: 'SAVE10', status: 'INVALID', message: 'Expired' })
    ).toBeUndefined();
  });

  it('keeps an applied code and one the quote has not answered yet', () => {
    const applied = { code: 'SAVE10', status: 'APPLIED' as const };
    expect(couponCodeToPlace(' SAVE10 ', applied)).toBe('SAVE10');
    expect(couponCodeToPlace('SAVE10', undefined)).toBe('SAVE10');
  });

  it('keeps a new code when the quote refused an earlier one', () => {
    expect(couponCodeToPlace('NEW20', { code: 'OLD', status: 'INVALID' })).toBe('NEW20');
  });

  it('sends nothing when there is no code', () => {
    expect(couponCodeToPlace('  ', undefined)).toBeUndefined();
    expect(couponCodeToPlace(undefined, { code: 'X', status: 'APPLIED' })).toBeUndefined();
  });
});
